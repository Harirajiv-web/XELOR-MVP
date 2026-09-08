import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import {
  AppError,
  Errors,
  checkApiKey,
  checkRetentionFloor,
  currentTenant,
  issueApiKey,
  newId,
  prefixOf,
  type ApiKeyRecord,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { apiKey, featureFlag, systemSetting, licenceRecord, backupJob, appUser, appSession, loginAttempt } = schema;

/**
 * PLATFORM OPERATIONS — machine access, flags, settings, licence and backups.
 *
 * The theme is the same in all five: make the thing that will hurt later impossible now.
 * A key whose secret can be read back, a retention setting quietly below the statutory
 * floor, a backup nobody proved restores, a licence that stops a plant at 5 p.m. on a
 * Friday — each is a decision that looks like configuration until the day it isn't.
 */
@Injectable()
export class PlatformOpsService {
  constructor(private readonly audit: AuditLogService) {}

  /* -------------------------------- API keys ------------------------------ */

  /**
   * Issue a key. The secret is returned ONCE and never stored.
   *
   * A key you can read back from the console is a key every admin who ever opened that
   * console still has — and there is deliberately no column here it could be read from.
   */
  async issueKey(input: {
    label: string;
    scopes: string[];
    environment?: "live" | "test";
    rateLimitRpm?: number;
    ipAllowlist?: string[];
    expiresAt?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (!input.scopes?.length) {
      throw new AppError(
        "ADMIN_KEY_UNSCOPED",
        422,
        "A key with no scopes can do nothing. Refusing it now is better than debugging it at 2 a.m. on a shop floor.",
      );
    }
    const issued = issueApiKey(input.environment ?? "live");
    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(apiKey).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        label: input.label,
        keyPrefix: issued.prefix,
        secretHash: issued.secretHash,
        scopes: input.scopes as unknown as object,
        environment: input.environment ?? "live",
        rateLimitRpm: input.rateLimitRpm ?? 60,
        ipAllowlist: (input.ipAllowlist ?? []) as unknown as object,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        status: "active",
      });
      await this.audit.appendInTx(tx, {
        action: "admin.apikey.issued",
        entityType: "api_key",
        entityId: id,
        // The secret never enters the audit trail either.
        data: { label: input.label, prefix: issued.prefix, scopes: input.scopes, environment: input.environment ?? "live" },
      });
      return {
        id,
        label: input.label,
        prefix: issued.prefix,
        scopes: input.scopes,
        secret: issued.secret,
        warning: "This secret is shown once and is not recoverable. Store it on the device now.",
      };
    });
  }

  /** Authenticate and authorise one machine call. */
  async checkKey(presented: string, scope: string, ip?: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const prefix = prefixOf(presented);
      const [row] = await tx.select().from(apiKey).where(eq(apiKey.keyPrefix, prefix)).limit(1);
      const record: ApiKeyRecord | null = row
        ? {
            prefix: row.keyPrefix,
            secretHash: row.secretHash,
            scopes: (row.scopes as string[]) ?? [],
            status: row.status as "active" | "revoked" | "expired",
            expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
            ipAllowlist: (row.ipAllowlist as string[]) ?? [],
            rateLimitRpm: row.rateLimitRpm,
          }
        : null;

      const verdict = checkApiKey(presented, record, { scope, ip: ip ?? null, asOf: new Date().toISOString() });
      if (verdict.ok && row) {
        await tx.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, row.id));
      }
      return { prefix, scope, ...verdict };
    });
  }

  async revokeKey(prefix: string, reason: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!reason?.trim()) throw new AppError("ADMIN_KEY_REASON_REQUIRED", 422, "Revoking a key needs a reason — a device will stop working and somebody will ask why.");
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(apiKey).where(eq(apiKey.keyPrefix, prefix)).limit(1);
      if (!row) throw Errors.notFound(`API key ${prefix}`);
      await tx
        .update(apiKey)
        .set({ status: "revoked", revokedAt: new Date(), revokedReason: reason, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(apiKey.id, row.id));
      await this.audit.appendInTx(tx, {
        action: "admin.apikey.revoked",
        entityType: "api_key",
        entityId: row.id,
        data: { prefix, label: row.label, reason },
      });
      return { prefix, status: "revoked", reason };
    });
  }

  async listKeys(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(apiKey).orderBy(desc(apiKey.createdAt));
      // Note what is absent: there is no field here that could carry the secret.
      return rows.map((r) => ({
        label: r.label, prefix: r.keyPrefix, scopes: r.scopes, environment: r.environment,
        status: r.status, rateLimitRpm: r.rateLimitRpm, lastUsedAt: r.lastUsedAt,
        expiresAt: r.expiresAt, revokedReason: r.revokedReason,
      }));
    });
  }

  /* ------------------------------- settings ------------------------------- */

  /**
   * Change a setting, with the statutory floor enforced and the statute named.
   *
   * The floor is checked here AND by a database CHECK. A floor only one code path enforces
   * is a floor until somebody writes a second code path.
   */
  async setSetting(key: string, value: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(systemSetting).where(eq(systemSetting.settingKey, key)).limit(1);
      if (!row) throw Errors.notFound(`setting ${key}`);

      if (row.valueType === "int") {
        const n = Number(value);
        if (!Number.isFinite(n)) throw Errors.validation([{ field: "value", message: `${key} is an integer setting` }]);
        const floor = checkRetentionFloor(key, n);
        if (!floor.ok) throw new AppError("ADMIN_BELOW_STATUTORY_FLOOR", 422, `${floor.reason}${row.floorSource ? ` (${row.floorSource})` : ""}`);
      }

      const before = row.value;
      await tx.update(systemSetting).set({ value, updatedBy: actorId, updatedAt: new Date() }).where(eq(systemSetting.id, row.id));
      await this.audit.appendInTx(tx, {
        action: "admin.setting.changed",
        entityType: "system_setting",
        entityId: row.id,
        data: { key, before, after: value, statutoryFloor: row.statutoryFloor, floorSource: row.floorSource },
      });
      return { key, before, after: value, floorSource: row.floorSource };
    });
  }

  async settings(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(systemSetting).orderBy(asc(systemSetting.settingKey));
      return rows.map((r) => ({
        key: r.settingKey, value: r.isSecret ? "•••" : r.value, valueType: r.valueType,
        statutoryFloor: r.statutoryFloor == null ? null : Number(r.statutoryFloor),
        floorSource: r.floorSource, description: r.description,
      }));
    });
  }

  /* ------------------------------ feature flags --------------------------- */

  async setFlag(flagKey: string, enabled: boolean): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(featureFlag).where(eq(featureFlag.flagKey, flagKey)).limit(1);
      if (!row) throw Errors.notFound(`feature flag ${flagKey}`);
      await tx.update(featureFlag).set({ enabled, updatedBy: actorId, updatedAt: new Date() }).where(eq(featureFlag.id, row.id));
      // Every toggle is audited. A flag that turns an AI feature on is a change to what the
      // system may do, and it belongs in the same trail as a permission grant.
      await this.audit.appendInTx(tx, {
        action: "admin.flag.toggled",
        entityType: "feature_flag",
        entityId: row.id,
        data: { flagKey, before: row.enabled, after: enabled, description: row.description },
      });
      return { flagKey, before: row.enabled, after: enabled, description: row.description };
    });
  }

  async flags(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(featureFlag).orderBy(asc(featureFlag.flagKey));
      return rows.map((r) => ({ flagKey: r.flagKey, enabled: r.enabled, scope: r.scope, description: r.description }));
    });
  }

  /* --------------------------- licence and posture ------------------------ */

  /**
   * Seats used against seats bought.
   *
   * Enforcement is SOFT on purpose: a plant does not stop because a licence lapsed on a
   * Friday evening. It says so, loudly, and keeps running.
   */
  async licence(asOf?: string): Promise<Record<string, unknown>> {
    const today = (asOf ?? new Date().toISOString()).slice(0, 10);
    return withTenant(async (tx) => {
      const [lic] = await tx.select().from(licenceRecord).orderBy(desc(licenceRecord.validTo)).limit(1);
      if (!lic) return { licensed: false, note: "No licence recorded for this tenant." };
      const active = await tx.select().from(appUser).where(and(eq(appUser.status, "active"), eq(appUser.isActive, true)));
      const used = active.length;
      const expired = today > lic.validTo;
      return {
        plan: lic.plan,
        namedSeats: lic.namedSeats,
        seatsUsed: used,
        seatsRemaining: lic.namedSeats - used,
        modules: lic.modules,
        validFrom: lic.validFrom,
        validTo: lic.validTo,
        enforcement: lic.enforcement,
        status: expired ? "expired" : used > lic.namedSeats ? "over_seats" : "ok",
        note: expired
          ? `The licence expired on ${lic.validTo}. Enforcement is soft, so the plant keeps running — but this needs renewing.`
          : used > lic.namedSeats
            ? `${used} active users against ${lic.namedSeats} seats. Nothing is blocked; the overage is recorded.`
            : `${used} of ${lic.namedSeats} seats in use.`,
      };
    });
  }

  async backups(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(backupJob).orderBy(asc(backupJob.name));
      return rows.map((r) => ({
        name: r.name, schedule: r.schedule, target: r.target, region: r.region,
        encryption: r.encryption, retentionPolicy: r.retentionPolicy,
        lastRunAt: r.lastRunAt, lastRunStatus: r.lastRunStatus,
        lastRestoreTestAt: r.lastRestoreTestAt,
        restorePreservedChain: r.restorePreservedChain,
        // The two facts that matter and are usually missing: is it in India, and has
        // anybody ever proved it restores WITHOUT breaking the audit chain?
        residency: r.region.startsWith("ap-south") ? "India" : "OUTSIDE INDIA — this is a data-residency problem",
        assurance:
          r.lastRestoreTestAt == null
            ? "Never restore-tested. An untested backup is a hope, not a control."
            : r.restorePreservedChain === true
              ? `Restore-tested ${r.lastRestoreTestAt.toISOString().slice(0, 10)}, and the audit chain survived it.`
              : `Restore-tested ${r.lastRestoreTestAt.toISOString().slice(0, 10)}, but chain preservation was NOT confirmed — a restore that breaks the chain destroys the evidence the backup existed to protect.`,
      }));
    });
  }

  /* -------------------------------- posture ------------------------------- */

  /** One screen a plant manager can look at and know whether the control plane is healthy. */
  async posture(asOf?: string): Promise<Record<string, unknown>> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const users = await tx.select().from(appUser).where(eq(appUser.isActive, true));
      const privilegedNoMfa = users.filter((u) => u.status === "active" && !u.mfaEnrolled);
      // `isNull`, NOT `eq(col, null)`. SQL `= NULL` is never true, so the previous form
      // reported ZERO live sessions while the whole company was signed in — and a security
      // screen that confidently understates its own numbers is worse than one that omits
      // them. The `as unknown as Date` cast was what let it past the compiler; that is the
      // shape to be suspicious of, not the comparison.
      const liveSessions = await tx.select().from(appSession).where(isNull(appSession.revokedAt));
      // The predicate goes in the WHERE, not after the LIMIT. Reading the 500 most recent
      // ATTEMPTS and then counting the failures among them misses a handful of failures
      // hiding behind ten thousand successes — which is exactly the pattern a slow
      // credential-stuffing run makes.
      const failures = await tx
        .select()
        .from(loginAttempt)
        .where(ne(loginAttempt.result, "success"))
        .orderBy(desc(loginAttempt.attemptedAt))
        .limit(500);
      const lic = await this.licence(now);
      const backupRows = await this.backups();

      const issues: string[] = [];
      if (privilegedNoMfa.length > 0) issues.push(`${privilegedNoMfa.length} active user(s) without MFA enrolled.`);
      if (backupRows.some((b) => b.restorePreservedChain !== true)) issues.push("A backup has never been proven to restore with the audit chain intact.");
      if (lic.status === "expired") issues.push("The licence has expired.");

      return {
        asOf: now,
        activeUsers: users.filter((u) => u.status === "active").length,
        usersWithoutMfa: privilegedNoMfa.length,
        liveSessions: liveSessions.length,
        recentFailedLogins: failures.length,
        licence: lic,
        backups: backupRows,
        issues,
        headline:
          issues.length === 0
            ? "The control plane is healthy: MFA is enrolled, backups are proven, the licence is current."
            : `${issues.length} posture issue(s) need attention.`,
      };
    });
  }
}
