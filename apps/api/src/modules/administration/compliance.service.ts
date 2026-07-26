import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  canonicalize,
  currentTenant,
  dsrClock,
  eventName,
  incidentClock,
  newId,
  verifyChainDetailed,
  type ChainRow,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { securityIncident, dsrRequest, consentRecord, chainVerification, auditAnchor, auditLog, aiActionLog, timeSyncLog, outboxEvent } = schema;

const iso = (d: Date): string => d.toISOString();

/**
 * COMPLIANCE — the two clocks the law starts, and the proof the record was not edited.
 *
 * Nothing here is optional and nothing here is a feature. CERT-In gives six hours from
 * DETECTION; DPDP gives seventy-two to intimate the Board and ninety days to answer a
 * person; the Companies Act wants eight years of trail that can be shown to be unaltered.
 *
 * The one design decision worth defending: verification results are STORED. "We verify the
 * chain nightly" is a claim; a row per night with a range and a verdict is evidence, and
 * evidence is the entire product here.
 */
@Injectable()
export class ComplianceService {
  constructor(private readonly audit: AuditLogService) {}

  /* ------------------------------- incidents ------------------------------ */

  /**
   * Record an incident.
   *
   * `detectedAt` is captured before anybody knows how bad it is, because both statutory
   * clocks run from it. The deadlines are computed here and enforced by the database — a
   * deadline that can be null is a deadline that gets missed.
   */
  async recordIncident(input: {
    incidentNo: string;
    title: string;
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    detectedAt: string;
    description: string;
    piiAffected?: boolean;
    dataPrincipalsEstimate?: number;
    certInReportable?: boolean;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const detected = new Date(input.detectedAt);
    if (Number.isNaN(detected.getTime())) {
      throw Errors.validation([{ field: "detectedAt", message: "must be a valid timestamp — both statutory clocks run from it" }]);
    }
    const pii = input.piiAffected ?? false;
    const reportable = input.certInReportable ?? false;

    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(securityIncident).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        incidentNo: input.incidentNo,
        title: input.title,
        severity: input.severity,
        category: input.category,
        detectedAt: detected,
        description: input.description,
        piiAffected: pii,
        dataPrincipalsEstimate: input.dataPrincipalsEstimate ?? null,
        certInReportable: reportable,
        certInDueAt: new Date(detected.getTime() + 6 * 3_600_000),
        dpdpBoardDueAt: pii ? new Date(detected.getTime() + 72 * 3_600_000) : null,
        status: "open",
      });

      await this.audit.appendInTx(tx, {
        action: "admin.incident.recorded",
        entityType: "security_incident",
        entityId: id,
        data: { incidentNo: input.incidentNo, severity: input.severity, certInReportable: reportable, piiAffected: pii },
      });
      await tx.insert(outboxEvent).values({
        id: newId(), tenantId,
        name: eventName("admin", "incident", "recorded"),
        payload: { incidentNo: input.incidentNo, severity: input.severity, certInReportable: reportable },
        createdAt: new Date(),
      });

      const clock = incidentClock({ detectedAt: iso(detected), certInReportable: reportable, piiAffected: pii, asOf: iso(new Date()) });
      return { id, incidentNo: input.incidentNo, ...clock };
    });
  }

  /** The register, every row with its live clock. */
  async incidents(asOf?: string): Promise<Record<string, unknown>[]> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const rows = await tx.select().from(securityIncident).orderBy(desc(securityIncident.detectedAt));
      return rows.map((r) => ({
        incidentNo: r.incidentNo,
        title: r.title,
        severity: r.severity,
        category: r.category,
        recordStatus: r.status,
        piiAffected: r.piiAffected,
        containmentNote: r.containmentNote,
        ...incidentClock({
          detectedAt: iso(r.detectedAt),
          certInReportable: r.certInReportable,
          piiAffected: r.piiAffected,
          certInReportedAt: r.certInReportedAt ? iso(r.certInReportedAt) : null,
          asOf: now,
        }),
      }));
    });
  }

  /** Mark an incident reported. The regulator's reference is required by the database. */
  async reportIncident(incidentNo: string, reference: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!reference?.trim()) {
      throw new AppError("ADMIN_INCIDENT_REF_REQUIRED", 422, "A CERT-In report has a reference. Recording the report without it leaves nothing to prove it happened.");
    }
    return withTenant(async (tx) => {
      const [inc] = await tx.select().from(securityIncident).where(eq(securityIncident.incidentNo, incidentNo)).limit(1);
      if (!inc) throw Errors.notFound(`incident ${incidentNo}`);
      const now = new Date();
      await tx
        .update(securityIncident)
        .set({ certInReportedAt: now, certInReference: reference, status: "reported", updatedBy: actorId, updatedAt: now })
        .where(eq(securityIncident.id, inc.id));

      const clock = incidentClock({
        detectedAt: iso(inc.detectedAt), certInReportable: inc.certInReportable, piiAffected: inc.piiAffected,
        certInReportedAt: iso(now), asOf: iso(now),
      });
      await this.audit.appendInTx(tx, {
        action: "admin.incident.reported",
        entityType: "security_incident",
        entityId: inc.id,
        data: { incidentNo, reference, breached: clock.breached },
      });
      return { incidentNo, reference, ...clock };
    });
  }

  /* --------------------------- data-principal rights ---------------------- */

  async dsrQueue(asOf?: string): Promise<Record<string, unknown>[]> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const rows = await tx.select().from(dsrRequest).orderBy(asc(dsrRequest.dueAt));
      return rows.map((r) => ({
        requestNo: r.requestNo,
        requestType: r.requestType,
        dataPrincipalRef: r.dataPrincipalRef,
        recordStatus: r.status,
        ...dsrClock({ receivedAt: iso(r.receivedAt), status: r.status, statutoryHoldRefs: r.statutoryHoldRefs, asOf: now }),
      }));
    });
  }

  /**
   * Refuse an erasure request under a statutory hold.
   *
   * Erasure cannot override a retention obligation the law imposes. The refusal must name
   * the obligation — "refused" alone is what a regulator asks about first.
   */
  async refuseDsr(requestNo: string, statutoryHoldRefs: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!statutoryHoldRefs?.trim()) {
      throw new AppError("ADMIN_DSR_HOLD_REQUIRED", 422, "A refusal must name the retention obligation it is refusing under.");
    }
    return withTenant(async (tx) => {
      const [r] = await tx.select().from(dsrRequest).where(eq(dsrRequest.requestNo, requestNo)).limit(1);
      if (!r) throw Errors.notFound(`request ${requestNo}`);
      await tx
        .update(dsrRequest)
        .set({ status: "refused_statutory_hold", statutoryHoldRefs, handledBy: actorId, closedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(dsrRequest.id, r.id));
      await this.audit.appendInTx(tx, {
        action: "admin.dsr.refused",
        entityType: "dsr_request",
        entityId: r.id,
        data: { requestNo, statutoryHoldRefs },
      });
      return { requestNo, statutoryHoldRefs, ...dsrClock({ receivedAt: iso(r.receivedAt), status: "refused_statutory_hold", statutoryHoldRefs, asOf: new Date().toISOString() }) };
    });
  }

  async consentLedger(dataPrincipalRef?: string): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(consentRecord).where(eq(consentRecord.isActive, true));
      return rows
        .filter((r) => (dataPrincipalRef ? r.dataPrincipalRef === dataPrincipalRef : true))
        .map((r) => ({
          dataPrincipalRef: r.dataPrincipalRef,
          purposeCode: r.purposeCode,
          basis: r.basis,
          givenAt: r.givenAt,
          withdrawnAt: r.withdrawnAt,
          // The distinction that matters: employment data is not withdrawable.
          note:
            r.basis === "legitimate_use_employment"
              ? "Processed under legitimate use (s.7) — employment data, not withdrawable. Payroll does not stop because somebody clicks withdraw."
              : r.withdrawnAt
                ? "Consent withdrawn. Processing for this purpose must stop."
                : "Consent given and current.",
        }));
    });
  }

  /* ------------------------------ the chain ------------------------------- */

  /**
   * Verify a hash chain and STORE the attestation.
   *
   * Both `audit_log` and `ai_action_log` chain the same way, so one verifier covers both —
   * two verifiers would eventually disagree about what a valid link looks like.
   */
  async verifyChain(chainName: "audit_log" | "ai_action_log" = "audit_log"): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const rows = chainName === "audit_log" ? await this.auditRows(tx) : await this.aiRows(tx);
      const result = verifyChainDetailed(rows);

      const id = newId();
      await tx.insert(chainVerification).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        chainName,
        fromSeq: result.fromSeq,
        toSeq: result.toSeq,
        rowsChecked: result.rowsChecked,
        intact: result.intact,
        firstBreakSeq: result.firstBreakSeq,
        breakKind: result.breakKind,
        message: result.message,
      });

      if (!result.intact) {
        // A broken chain is an incident, not a log line. It is raised on the bus so
        // whatever is watching pages somebody.
        await tx.insert(outboxEvent).values({
          id: newId(), tenantId,
          name: eventName("admin", "chain", "broken"),
          payload: { chainName, firstBreakSeq: result.firstBreakSeq, breakKind: result.breakKind },
          createdAt: new Date(),
        });
      }

      await this.audit.appendInTx(tx, {
        action: "admin.chain.verified",
        entityType: "chain_verification",
        entityId: id,
        data: { chainName, intact: result.intact, rowsChecked: result.rowsChecked, breakKind: result.breakKind },
      });

      return { chainName, ...result, attestationId: id };
    });
  }

  private async auditRows(tx: Tx): Promise<ChainRow[]> {
    const rows = await tx
      .select()
      .from(auditLog)
      .orderBy(asc(auditLog.seq));
    return rows.map((r) => ({
      seq: r.seq,
      prevHash: r.prevHash,
      rowHash: r.hash,
      payload: canonicalize({
        tenantId: r.tenantId,
        seq: r.seq,
        actorId: r.actorId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        data: r.data,
        at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
      }),
    }));
  }

  /**
   * The AI chain's payload must be reconstructed EXACTLY as the writer built it, or every
   * row looks tampered with. It hashes over content hashes and the decision — never the raw
   * prompt or completion, so verifying the chain never re-reads anybody's data.
   */
  private async aiRows(tx: Tx): Promise<ChainRow[]> {
    const rows = await tx.select().from(aiActionLog).orderBy(asc(aiActionLog.seq));
    return rows.map((r) => ({
      seq: r.seq,
      prevHash: r.prevHash,
      rowHash: r.hash,
      payload: canonicalize({
        tenantId: r.tenantId,
        seq: r.seq,
        actorId: r.actorId,
        action: `ai.${r.featureKey}`,
        entityType: "ai_action",
        entityId: r.featureKey,
        data: {
          inputHash: r.inputHash,
          outputHash: r.outputHash,
          model: r.model,
          tier: r.tier,
          degraded: r.degraded,
          decision: r.decision ?? null,
        },
        at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
      }),
    }));
  }

  /** Daily checkpoint, so a later verify can start from a known-good point. */
  async anchor(): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [last] = await tx.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(1);
      if (!last) return { anchored: false, reason: "Nothing to anchor — the chain is empty." };
      const id = newId();
      await tx.insert(auditAnchor).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        uptoSeq: last.seq,
        anchorHash: last.hash,
      });
      return { anchored: true, uptoSeq: last.seq, anchorHash: last.hash, anchorId: id };
    });
  }

  async verifications(chainName?: string): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(chainVerification).orderBy(desc(chainVerification.verifiedAt)).limit(50);
      return rows.filter((r) => (chainName ? r.chainName === chainName : true)).map((r) => ({ ...r }));
    });
  }

  /**
   * The MCA Rule 11(g) auditor pack.
   *
   * A range of the trail, the verification that covers it, and the retention posture — the
   * three things an auditor asks for. It is assembled rather than dumped: an export of a
   * million rows with no attestation proves only that a lot of rows exist.
   */
  async auditorPack(fromSeq: number, toSeq: number): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(auditLog)
        .where(and(sql`${auditLog.seq} >= ${fromSeq}`, sql`${auditLog.seq} <= ${toSeq}`))
        .orderBy(asc(auditLog.seq));
      const verification = verifyChainDetailed(
        (await this.auditRows(tx)).filter((r) => r.seq >= fromSeq && r.seq <= toSeq),
      );
      const [latestAnchor] = await tx.select().from(auditAnchor).orderBy(desc(auditAnchor.uptoSeq)).limit(1);
      const sync = await tx.select().from(timeSyncLog).orderBy(desc(timeSyncLog.checkedAt)).limit(3);

      return {
        statute: "Companies (Accounts) Rules 2014, Rule 11(g) — audit trail, 8-year retention",
        range: { fromSeq, toSeq, entries: rows.length },
        verification,
        latestAnchor: latestAnchor ? { uptoSeq: latestAnchor.uptoSeq, anchoredAt: latestAnchor.anchoredAt } : null,
        // CERT-In requires NIC/NPL-traceable time. An audit trail whose timestamps came
        // from an unsynchronised clock is a trail whose ordering cannot be relied on.
        timeTraceability: sync.map((s) => ({ host: s.host, source: s.source, offsetMs: Number(s.offsetMs), checkedAt: s.checkedAt })),
        entries: rows.map((r) => ({
          seq: r.seq, at: r.at, actorId: r.actorId, action: r.action,
          entityType: r.entityType, entityId: r.entityId, hash: r.hash,
        })),
        assertion: verification.intact
          ? `Entries ${fromSeq}–${toSeq} verify against their hash chain: no entry in this range was altered, replaced or removed.`
          : `CHAIN BROKEN at ${verification.firstBreakSeq} (${verification.breakKind}). This pack is evidence of the break, not of integrity.`,
      };
    });
  }
}
