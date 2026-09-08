import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  checkGrant,
  currentTenant,
  eventName,
  groundExplanation,
  newId,
  scanSod,
  type SodEnforcement,
  type SodFinding,
  type SodRiskLevel,
  type SodRule,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { SodExplainer } from "../../ai/sod-explainer.js";

const { role, userRole, appUser, sodRule, sodFinding, featureFlag, outboxEvent } = schema;

/**
 * SEGREGATION OF DUTIES.
 *
 * The verdict is always the deterministic matrix. AI #8 may only phrase a finding the
 * rules already produced, the grounding gate checks that it introduced nothing, and the
 * database refuses to store an ungrounded explanation at all. The template sentence is
 * stored alongside every finding regardless — so the record still reads correctly when the
 * model is off, which is its default state.
 */
@Injectable()
export class SodService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly explainer: SodExplainer,
  ) {}

  async listRules(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await this.rulesInTx(tx);
      return rows.map((r) => ({ ...r }));
    });
  }

  private async rulesInTx(tx: Tx): Promise<SodRule[]> {
    const rows = await tx.select().from(sodRule).where(eq(sodRule.isActive, true)).orderBy(asc(sodRule.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      roleACode: r.roleACode,
      roleBCode: r.roleBCode,
      riskLevel: r.riskLevel as SodRiskLevel,
      enforcement: r.enforcement as SodEnforcement,
      description: r.description,
      compensatingControl: r.compensatingControl,
    }));
  }

  private async subjectsInTx(tx: Tx) {
    const assignments = await tx
      .select({ subject: userRole.subject, roleCode: role.code })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(and(eq(userRole.isActive, true), eq(role.isActive, true)));
    const users = await tx.select().from(appUser).where(eq(appUser.isActive, true));
    const nameOf = new Map(users.map((u) => [u.keycloakSub, u.fullName]));

    const bySubject = new Map<string, string[]>();
    for (const a of assignments) {
      if (!bySubject.has(a.subject)) bySubject.set(a.subject, []);
      bySubject.get(a.subject)!.push(a.roleCode);
    }
    return [...bySubject.entries()].map(([subject, roleCodes]) => ({
      subject,
      subjectName: nameOf.get(subject) ?? subject,
      roleCodes,
    }));
  }

  /**
   * Scan the tenant and PERSIST the findings.
   *
   * Persisted rather than recomputed on every view, so "when did this start?" has an
   * answer and an accepted-risk decision has something durable to attach to. A finding that
   * evaporates on the next scan cannot carry a signature.
   */
  async scan(): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const rules = await this.rulesInTx(tx);
      const subjects = await this.subjectsInTx(tx);
      const found = scanSod(subjects, rules);

      let created = 0;
      for (const f of found) {
        const existing = await tx
          .select()
          .from(sodFinding)
          .where(and(eq(sodFinding.ruleId, f.ruleId), eq(sodFinding.subject, f.subject)))
          .limit(1);
        if (existing.length > 0) continue;
        await tx.insert(sodFinding).values({
          id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
          ruleId: f.ruleId,
          subject: f.subject,
          subjectName: f.subjectName,
          riskLevel: f.riskLevel,
          templateExplanation: f.templateExplanation,
          status: "open",
        });
        created += 1;
      }

      // A finding whose conflict no longer exists is resolved, not deleted — the history of
      // having held it is the thing an auditor asks about.
      const open = await tx.select().from(sodFinding).where(eq(sodFinding.status, "open"));
      const live = new Set(found.map((f) => `${f.ruleId}:${f.subject}`));
      let resolved = 0;
      for (const o of open) {
        if (live.has(`${o.ruleId}:${o.subject}`)) continue;
        await tx.update(sodFinding).set({ status: "resolved", resolvedAt: new Date(), updatedBy: actorId, updatedAt: new Date() }).where(eq(sodFinding.id, o.id));
        resolved += 1;
      }

      await this.audit.appendInTx(tx, {
        action: "admin.sod.scanned",
        entityType: "sod_finding",
        entityId: tenantId,
        data: { subjectsScanned: subjects.length, rules: rules.length, found: found.length, created, resolved },
      });

      if (created > 0) {
        await tx.insert(outboxEvent).values({
          id: newId(), tenantId,
          name: eventName("admin", "sod", "detected"),
          payload: { created, worst: found[0]?.riskLevel ?? null },
          createdAt: new Date(),
        });
      }

      return {
        subjectsScanned: subjects.length,
        rulesApplied: rules.length,
        conflictsFound: found.length,
        newFindings: created,
        resolvedFindings: resolved,
        bySeverity: found.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.riskLevel]: (acc[f.riskLevel] ?? 0) + 1 }), {}),
        headline:
          found.length === 0
            ? "No segregation-of-duties conflicts. Every user's roles are compatible."
            : `${found.length} conflict(s) across ${new Set(found.map((f) => f.subject)).size} user(s). ${found.filter((f) => f.riskLevel === "critical").length} critical.`,
      };
    });
  }

  async findings(status = "open"): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(sodFinding).where(eq(sodFinding.status, status));
      const rules = await this.rulesInTx(tx);
      const ruleOf = new Map(rules.map((r) => [r.id, r]));
      const order = ["critical", "high", "medium", "low"];
      return rows
        .sort((a, b) => order.indexOf(a.riskLevel) - order.indexOf(b.riskLevel) || a.subjectName.localeCompare(b.subjectName))
        .map((r) => ({
          id: r.id,
          subject: r.subject,
          subjectName: r.subjectName,
          riskLevel: r.riskLevel,
          status: r.status,
          detectedAt: r.detectedAt,
          rule: ruleOf.get(r.ruleId)?.name ?? r.ruleId,
          roles: [ruleOf.get(r.ruleId)?.roleACode, ruleOf.get(r.ruleId)?.roleBCode].filter(Boolean),
          enforcement: ruleOf.get(r.ruleId)?.enforcement ?? "detect",
          // The deterministic sentence is what is shown. The AI one is an addition.
          explanation: r.templateExplanation,
          aiExplanation: r.aiExplanation,
          compensatingControl: ruleOf.get(r.ruleId)?.compensatingControl ?? null,
        }));
    });
  }

  /**
   * Check a proposed grant BEFORE it is made.
   *
   * Only a `prevent` rule refuses. Everything else is granted and recorded, because a
   * control that stops a four-person office from operating is switched off in week two.
   */
  async checkProposedGrant(subject: string, newRoleCode: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const rules = await this.rulesInTx(tx);
      const subjects = await this.subjectsInTx(tx);
      const mine = subjects.find((s) => s.subject === subject);
      const [u] = await tx.select().from(appUser).where(eq(appUser.keycloakSub, subject)).limit(1);

      const verdict = checkGrant(
        {
          subject,
          subjectName: mine?.subjectName ?? u?.fullName ?? subject,
          currentRoleCodes: mine?.roleCodes ?? [],
          newRoleCode,
        },
        rules,
      );
      return { subject, newRoleCode, ...verdict };
    });
  }

  /** Assign a role, refusing only where a `prevent` rule says so. */
  async assignRole(subject: string, roleCode: string): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const verdict = await this.checkProposedGrant(subject, roleCode);
    if (verdict.allowed === false) {
      throw new AppError("ADMIN_SOD_REFUSED", 409, String(verdict.reason));
    }
    return withTenant(async (tx) => {
      const [r] = await tx.select().from(role).where(eq(role.code, roleCode)).limit(1);
      if (!r) throw Errors.notFound(`role ${roleCode}`);
      const existing = await tx
        .select()
        .from(userRole)
        .where(and(eq(userRole.subject, subject), eq(userRole.roleId, r.id)))
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(userRole).values({ id: newId(), tenantId, createdBy: actorId, updatedBy: actorId, subject, roleId: r.id });
      }
      await this.audit.appendInTx(tx, {
        action: "admin.role.assigned",
        entityType: "user_role",
        entityId: subject,
        data: { roleCode, warnings: verdict.warnings },
      });
      return { subject, roleCode, outcome: "assigned", ...verdict };
    });
  }

  /**
   * Accept a conflict as a known risk.
   *
   * The name and the reason are both required by the database. "Accepted risk" with
   * nobody's name on it is how a control becomes a checkbox.
   */
  async acceptRisk(findingId: string, reason: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!reason?.trim()) {
      throw new AppError("ADMIN_SOD_REASON_REQUIRED", 422, "Accepting a segregation-of-duties risk needs a reason and a name. Without them the control is a checkbox.");
    }
    return withTenant(async (tx) => {
      const [f] = await tx.select().from(sodFinding).where(eq(sodFinding.id, findingId)).limit(1);
      if (!f) throw Errors.notFound(`SoD finding ${findingId}`);
      await tx
        .update(sodFinding)
        .set({ status: "accepted_risk", acceptedBy: actorId, acceptedReason: reason, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(sodFinding.id, findingId));
      await this.audit.appendInTx(tx, {
        action: "admin.sod.risk_accepted",
        entityType: "sod_finding",
        entityId: findingId,
        data: { subjectName: f.subjectName, riskLevel: f.riskLevel, reason },
      });
      return { findingId, status: "accepted_risk", acceptedReason: reason, subjectName: f.subjectName };
    });
  }

  /**
   * AI #8 — have the model phrase a finding the rules already produced.
   *
   * Off by default, gated by a feature flag, Tier 3 (advisory forever). The explanation is
   * stored only if the grounding gate passes, and never instead of the template sentence.
   */
  async explainWithAi(findingId: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [flag] = await tx.select().from(featureFlag).where(eq(featureFlag.flagKey, "ai_sod_explain")).limit(1);
      const [f] = await tx.select().from(sodFinding).where(eq(sodFinding.id, findingId)).limit(1);
      if (!f) throw Errors.notFound(`SoD finding ${findingId}`);
      const rules = await this.rulesInTx(tx);
      const rule = rules.find((r) => r.id === f.ruleId);
      if (!rule) throw Errors.notFound(`SoD rule ${f.ruleId}`);

      if (!flag?.enabled) {
        return {
          findingId,
          explanation: f.templateExplanation,
          source: "template",
          degraded: true,
          note: "AI explanation is switched off for this tenant. The deterministic sentence is the product; the model only ever rephrases it.",
        };
      }

      const finding: SodFinding = {
        ruleId: rule.id, ruleName: rule.name, subject: f.subject, subjectName: f.subjectName,
        roleACode: rule.roleACode, roleBCode: rule.roleBCode,
        riskLevel: rule.riskLevel, enforcement: rule.enforcement,
        description: rule.description, compensatingControl: rule.compensatingControl ?? null,
        templateExplanation: f.templateExplanation,
      };

      const drafted = await this.explainer.explain(finding);
      const gate = groundExplanation(finding, drafted.text);

      if (!gate.ok || drafted.degraded) {
        await this.audit.appendInTx(tx, {
          action: "admin.sod.ai_explanation_rejected",
          entityType: "sod_finding",
          entityId: findingId,
          data: { violations: gate.violations, degraded: drafted.degraded },
        });
        return {
          findingId,
          explanation: f.templateExplanation,
          source: "template",
          degraded: true,
          rejected: gate.violations,
          note: "The drafted explanation failed the grounding gate, so the deterministic sentence is used. Nothing is lost except a nicer sentence.",
        };
      }

      await tx
        .update(sodFinding)
        .set({ aiExplanation: drafted.text, aiGrounded: true, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(sodFinding.id, findingId));

      return {
        findingId,
        explanation: drafted.text,
        templateExplanation: f.templateExplanation,
        source: "ai",
        degraded: false,
        model: drafted.model,
        note: "Grounded against the finding. The verdict came from the rules; the model only chose the words.",
      };
    });
  }
}
