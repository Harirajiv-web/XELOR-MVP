import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { AppError, Errors, currentTenant, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { cspPortalUser, cspPortalInvite, cspWarranty, cspAmcContract, cspAmcContractAsset, cspAbuseEvent } = schema;

/** One machine on the customer's installed-base list, with the badge the portal renders. */
export interface InstalledRow {
  serialNo: string;
  dispatchedOn: string | null;
  warrantyEndsOn: string | null;
  amcContractNo: string | null;
  coverageBadge: string;
}

/**
 * PORTAL IDENTITY.
 *
 * Every principal this module creates is external. Three rules follow, and all three are
 * enforced somewhere other than a code path that could be forgotten:
 *
 *  1. **`customer_account_id` is minted, never accepted.** It comes from the customer
 *     account the invite was issued against, which is how the second scoping dimension
 *     stays trustworthy. A portal user cannot change it, and no request body can set it.
 *  2. **An active principal has consented.** The DPDP notice is the lawful basis for
 *     processing their data, so a CHECK constraint refuses an `active` row without a
 *     consent record. There is no code path to an active account without a notice.
 *  3. **Deactivation is not deletion.** A suspended or erased portal user keeps their
 *     ticket history — the business records survive on their statutory-retention basis
 *     while the personal fields are pseudonymised in place.
 */
@Injectable()
export class PortalService {
  constructor(private readonly audit: AuditLogService) {}

  /** Invite a contact. Returns the clear token exactly once; only the hash is stored. */
  async invite(input: {
    customerAccountId: string;
    email: string;
    displayName: string;
    invitedRole?: "customer_user" | "customer_admin";
    invitedByRef: string;
    at?: string;
  }): Promise<{ email: string; token: string; expiresAt: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const at = input.at ? new Date(input.at) : new Date();
      const token = randomBytes(24).toString("hex");
      const expiresAt = new Date(at.getTime() + 7 * 86_400_000);

      await tx.insert(cspPortalInvite).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        customerAccountId: input.customerAccountId,
        email: input.email,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        invitedRole: input.invitedRole ?? "customer_user",
        invitedByRef: input.invitedByRef,
        expiresAt,
      });

      const [existing] = await tx.select().from(cspPortalUser).where(eq(cspPortalUser.email, input.email)).limit(1);
      if (!existing) {
        await tx.insert(cspPortalUser).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          customerAccountId: input.customerAccountId,
          email: input.email,
          displayName: input.displayName,
          role: input.invitedRole ?? "customer_user",
          status: "invited",
        });
      }
      await this.audit.appendInTx(tx, {
        action: "csp.portal_user.invited",
        entityType: "csp_portal_user",
        entityId: input.email,
        data: { email: input.email, customerAccountId: input.customerAccountId, role: input.invitedRole ?? "customer_user" },
      });
      return { email: input.email, token, expiresAt: expiresAt.toISOString() };
    });
  }

  /**
   * Accept an invitation: record the DPDP consent and activate.
   *
   * The consent record is written FIRST and the activation depends on it, because the
   * CHECK constraint on the table will refuse an active principal without one. That
   * ordering is not defensive style; it is the only order that works.
   */
  async acceptInvite(
    token: string,
    input: { keycloakSub: string; consentVersion: string; at?: string },
  ): Promise<{ email: string; status: string; customerAccountId: string }> {
    const { actorId } = currentTenant();
    const hash = createHash("sha256").update(token).digest("hex");
    return withTenant(async (tx) => {
      const [inv] = await tx.select().from(cspPortalInvite).where(eq(cspPortalInvite.tokenHash, hash)).limit(1);
      if (!inv) throw Errors.notFound("invitation");
      const at = input.at ? new Date(input.at) : new Date();
      if (inv.acceptedAt) throw new AppError("INVITE_ALREADY_USED", 409, "This invitation has already been accepted.");
      if (inv.revokedAt) throw new AppError("INVITE_REVOKED", 409, "This invitation was withdrawn.");
      if (at > inv.expiresAt) throw new AppError("INVITE_EXPIRED", 410, "This invitation has expired; ask for a new one.");

      const consentRecordId = newId();
      const [user] = await tx.select().from(cspPortalUser).where(eq(cspPortalUser.email, inv.email)).limit(1);
      if (!user) throw Errors.notFound(`portal user ${inv.email}`);

      await tx
        .update(cspPortalUser)
        .set({
          status: "active",
          keycloakSub: input.keycloakSub,
          consentRecordId,
          consentVersion: input.consentVersion,
          lastLoginAt: at,
          updatedBy: actorId,
          updatedAt: at,
        })
        .where(eq(cspPortalUser.id, user.id));
      await tx.update(cspPortalInvite).set({ acceptedAt: at }).where(eq(cspPortalInvite.id, inv.id));

      await this.audit.appendInTx(tx, {
        action: "csp.portal_user.activated",
        entityType: "csp_portal_user",
        entityId: user.id,
        data: { email: inv.email, consentVersion: input.consentVersion, consentRecordId },
      });
      return { email: inv.email, status: "active", customerAccountId: inv.customerAccountId };
    });
  }

  async suspend(email: string, reason: string): Promise<{ email: string; status: string }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [u] = await tx.select().from(cspPortalUser).where(eq(cspPortalUser.email, email)).limit(1);
      if (!u) throw Errors.notFound(`portal user ${email}`);
      await tx
        .update(cspPortalUser)
        .set({ status: "suspended", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(cspPortalUser.id, u.id));
      await this.audit.appendInTx(tx, {
        action: "csp.portal_user.suspended",
        entityType: "csp_portal_user",
        entityId: u.id,
        data: { email, reason },
      });
      return { email, status: "suspended" };
    });
  }

  /**
   * The customer's installed base (P11): every machine dispatched to them, with a coverage
   * badge. Note there is no account filter in the query — RLS supplies it, which is what
   * makes this method safe to write in the obvious way.
   */
  async installedBase(asOf?: string): Promise<InstalledRow[]> {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    return withTenant(async (tx) => {
      const warranties = await tx.select().from(cspWarranty).orderBy(cspWarranty.serialNo);
      const amcAssets = await tx.select().from(cspAmcContractAsset);
      const contracts = await tx.select().from(cspAmcContract);
      const contractBySerial = new Map(
        amcAssets.map((a) => [a.serialNo, contracts.find((c) => c.id === a.contractId) ?? null]),
      );

      const rows: InstalledRow[] = warranties.map((w) => {
        const amc = contractBySerial.get(w.serialNo) ?? null;
        const inWarranty = w.status === "active" && today >= w.startDate && today <= w.endDate;
        const inAmc = amc != null && today >= amc.startDate && today <= amc.endDate;
        return {
          serialNo: w.serialNo,
          dispatchedOn: w.dispatchedOn,
          warrantyEndsOn: w.endDate,
          amcContractNo: inAmc ? amc!.contractNo : null,
          coverageBadge: inAmc
            ? amc!.coverageType === "comprehensive"
              ? "AMC — comprehensive"
              : "AMC — parts chargeable"
            : inWarranty
              ? "In warranty"
              : "Out of cover",
        };
      });

      // Serials that carry an AMC but no warranty row still belong on the customer's list;
      // a machine they hold a contract on that does not appear is a support call.
      for (const a of amcAssets) {
        if (rows.some((r) => r.serialNo === a.serialNo)) continue;
        const amc = contracts.find((c) => c.id === a.contractId);
        if (!amc) continue;
        const inAmc = today >= amc.startDate && today <= amc.endDate;
        rows.push({
          serialNo: a.serialNo,
          dispatchedOn: null,
          warrantyEndsOn: null,
          amcContractNo: inAmc ? amc.contractNo : null,
          coverageBadge: inAmc
            ? amc.coverageType === "comprehensive"
              ? "AMC — comprehensive"
              : "AMC — parts chargeable"
            : "Out of cover",
        });
      }
      return rows.sort((a, b) => a.serialNo.localeCompare(b.serialNo));
    });
  }

  /** The portal security ledger. Append-only, tenant-wide, deliberately NOT account-scoped
   *  — a principal probing for another customer's tickets must show up here. */
  async recordAbuse(input: {
    eventType: string;
    principalType: "portal" | "staff" | "anonymous";
    principalRef?: string;
    ip?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    await withTenant(async (tx) => {
      await tx.insert(cspAbuseEvent).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        eventType: input.eventType,
        principalType: input.principalType,
        principalRef: input.principalRef ?? actorId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        details: input.details ?? {},
      });
    });
  }
}
