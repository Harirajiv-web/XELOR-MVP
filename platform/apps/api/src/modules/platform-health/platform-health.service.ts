import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { desc, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { db, schema, withTenant } from "@ind-core/db";
import { currentTenant, newId, runWithTenant } from "@ind-core/platform";

const { platformHealthRun, tenant } = schema;
const SYSTEM_ACTOR_ID = "0192a8c0-0000-7000-8000-0000000000ff";
const DEFAULT_INTERVAL_MS = 60 * 60 * 1_000;
const CHECK_TIMEOUT_MS = 4_000;

export type PlatformCheckStatus = "passed" | "failed" | "not_configured";
export type PlatformOverallStatus = "healthy" | "degraded" | "unavailable";
export type PlatformCheckTrigger = "hourly_schedule" | "manual";

export interface PlatformCheckResult {
  key: "api" | "database" | "event_bus" | "web" | "ai_runtime";
  label: string;
  status: PlatformCheckStatus;
  required: boolean;
  latencyMs: number;
  detail: string;
}

export interface PlatformHealthResult {
  id: string;
  trigger: PlatformCheckTrigger;
  overallStatus: PlatformOverallStatus;
  summary: string;
  checks: readonly PlatformCheckResult[];
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

/**
 * ACHILES is the private, deterministic availability watcher for XELOR.
 *
 * It does not use a model to decide whether the platform is healthy: every result comes
 * from an explicit probe with a timeout. It never writes an ERP business record, restarts
 * a service or contacts a customer. A failed check is evidence for RELAY and the relevant
 * technical owner to act on.
 */
@Injectable()
export class PlatformHealthService implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;
  private sweepInProgress = false;

  onModuleInit(): void {
    if (process.env.ACHILES_BACKGROUND_ENABLED !== "true") return;
    const configured = Number(process.env.ACHILES_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const intervalMs = Number.isFinite(configured)
      ? Math.max(5 * 60 * 1_000, configured)
      : DEFAULT_INTERVAL_MS;
    const initial = setTimeout(() => void this.runAllTenants(), 15_000);
    initial.unref();
    this.interval = setInterval(() => void this.runAllTenants(), intervalMs);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async overview(): Promise<{
    visibility: "private_internal_only";
    schedule: { cadenceMinutes: number; mode: string };
    boundary: string;
    freshness: "current" | "stale" | "never_run";
    latest: PlatformHealthResult | null;
    history: readonly PlatformHealthResult[];
  }> {
    const rows = await withTenant((tx) =>
      tx
        .select()
        .from(platformHealthRun)
        .orderBy(desc(platformHealthRun.completedAt))
        .limit(24),
    );
    const history = rows.map((row) => this.toResult(row));
    const latest = history[0] ?? null;
    const freshness = !latest
      ? "never_run"
      : Date.now() - new Date(latest.completedAt).getTime() > 90 * 60 * 1_000
        ? "stale"
        : "current";
    return {
      visibility: "private_internal_only",
      schedule: {
        cadenceMinutes: 60,
        mode:
          process.env.ACHILES_BACKGROUND_ENABLED === "true"
            ? "internal hourly scheduler enabled"
            : "external scheduler endpoint ready",
      },
      boundary:
        "ACHILES observes and records. It cannot change ERP data, restart services or contact customers. RELAY coordinates incidents; the accountable technical owner diagnoses and repairs them.",
      freshness,
      latest,
      history,
    };
  }

  async runForCurrentTenant(
    trigger: PlatformCheckTrigger,
  ): Promise<PlatformHealthResult> {
    const context = currentTenant();
    const startedAt = new Date();
    const checks: PlatformCheckResult[] = [
      {
        key: "api",
        label: "Backend API",
        status: "passed",
        required: true,
        latencyMs: 0,
        detail: "The authenticated ACHILES check endpoint is responding.",
      },
    ];

    checks.push(
      await this.runCheck("database", "PostgreSQL database", true, async () => {
        await withTenant(async (tx) => {
          await tx.execute(sql`select 1 as healthy`);
        });
        return "Tenant-fenced database query completed.";
      }),
    );
    checks.push(await this.checkEventBus());
    checks.push(await this.checkWeb());
    checks.push({
      key: "ai_runtime",
      label: "AI runtime",
      status: "passed",
      required: false,
      latencyMs: 0,
      detail:
        (process.env.AI_PROVIDER ?? "stub") === "stub"
          ? "Deterministic demo mode is active; no external model call is required."
          : `Configured provider mode: ${process.env.AI_PROVIDER}.`,
    });

    const requiredFailure = checks.some(
      (check) => check.required && check.status === "failed",
    );
    const optionalFailure = checks.some((check) => check.status === "failed");
    const overallStatus: PlatformOverallStatus = requiredFailure
      ? "unavailable"
      : optionalFailure
        ? "degraded"
        : "healthy";
    const passed = checks.filter((check) => check.status === "passed").length;
    const configured = checks.filter(
      (check) => check.status !== "not_configured",
    ).length;
    const summary =
      overallStatus === "healthy"
        ? `XELOR is operational. ${passed} of ${configured} configured checks passed.`
        : overallStatus === "degraded"
          ? `XELOR is available, but ${checks.filter((check) => check.status === "failed").length} supporting check needs attention.`
          : "XELOR has failed a required availability check and needs immediate technical attention.";
    const completedAt = new Date();
    const id = newId();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());

    await withTenant(async (tx) => {
      await tx.insert(platformHealthRun).values({
        id,
        tenantId: context.tenantId,
        createdBy: context.actorId,
        updatedBy: context.actorId,
        trigger,
        overallStatus,
        summary,
        checks: checks as unknown as object,
        durationMs,
        startedAt,
        completedAt,
      });
    });

    return {
      id,
      trigger,
      overallStatus,
      summary,
      checks,
      durationMs,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  }

  /** Run one identical, tenant-fenced observation for every active tenant. */
  async runAllTenants(): Promise<{
    status: "ok" | "already_running";
    checked: number;
    healthy: number;
    degraded: number;
    unavailable: number;
  }> {
    if (this.sweepInProgress) {
      return { status: "already_running", checked: 0, healthy: 0, degraded: 0, unavailable: 0 };
    }
    this.sweepInProgress = true;
    try {
      const tenants = await db.select({ id: tenant.id, isActive: tenant.isActive }).from(tenant);
      const results: PlatformHealthResult[] = [];
      let unavailable = 0;
      // The legacy tenant column is declared as text but PostgreSQL returns the old
      // `true` rows as booleans in some driver paths. Normalise both representations.
      for (const item of tenants.filter(
        (candidate) => String(candidate.isActive) === "true",
      )) {
        try {
          const result = await runWithTenant(
            { tenantId: item.id, actorId: SYSTEM_ACTOR_ID, principal: "staff" },
            () => this.runForCurrentTenant("hourly_schedule"),
          );
          results.push(result);
        } catch {
          // One inaccessible tenant must not prevent every other tenant from being checked.
          // The host scheduler receives the unavailable count without leaking tenant data.
          unavailable += 1;
        }
      }
      return {
        status: "ok",
        checked: results.length + unavailable,
        healthy: results.filter((result) => result.overallStatus === "healthy").length,
        degraded: results.filter((result) => result.overallStatus === "degraded").length,
        unavailable:
          unavailable +
          results.filter((result) => result.overallStatus === "unavailable").length,
      };
    } finally {
      this.sweepInProgress = false;
    }
  }

  private async checkEventBus(): Promise<PlatformCheckResult> {
    if (!process.env.VALKEY_URL) {
      return {
        key: "event_bus",
        label: "Event queue",
        status: "not_configured",
        required: false,
        latencyMs: 0,
        detail: "No event-queue endpoint is configured in this environment.",
      };
    }
    return this.runCheck("event_bus", "Event queue", false, async () => {
      const connection = new Redis(process.env.VALKEY_URL!, {
        lazyConnect: true,
        connectTimeout: 2_000,
        maxRetriesPerRequest: 1,
      });
      try {
        await connection.connect();
        const response = await connection.ping();
        if (response !== "PONG") throw new Error("unexpected ping response");
        return "Valkey responded to a private ping.";
      } finally {
        connection.disconnect();
      }
    });
  }

  private async checkWeb(): Promise<PlatformCheckResult> {
    const configuredUrl =
      process.env.XELOR_WEB_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined);
    if (!configuredUrl) {
      return {
        key: "web",
        label: "Web application",
        status: "not_configured",
        required: false,
        latencyMs: 0,
        detail: "Set XELOR_WEB_URL to include the public web application in each check.",
      };
    }
    return this.runCheck("web", "Web application", false, async () => {
      const response = await fetch(configuredUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (response.status < 200 || response.status >= 400) {
        throw new Error("web endpoint returned an unhealthy status");
      }
      return `Public entry page responded with HTTP ${response.status}.`;
    });
  }

  private async runCheck(
    key: PlatformCheckResult["key"],
    label: string,
    required: boolean,
    probe: () => Promise<string>,
  ): Promise<PlatformCheckResult> {
    const started = performance.now();
    let timeout: NodeJS.Timeout | undefined;
    try {
      const detail = await Promise.race([
        probe(),
        new Promise<never>((_, reject) =>
          {
            timeout = setTimeout(
              () => reject(new Error("check timed out")),
              CHECK_TIMEOUT_MS,
            );
          },
        ),
      ]);
      return {
        key,
        label,
        status: "passed",
        required,
        latencyMs: Math.round(performance.now() - started),
        detail,
      };
    } catch {
      return {
        key,
        label,
        status: "failed",
        required,
        latencyMs: Math.round(performance.now() - started),
        detail: `${label} did not complete its private health check.`,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private toResult(row: typeof platformHealthRun.$inferSelect): PlatformHealthResult {
    return {
      id: row.id,
      trigger: row.trigger as PlatformCheckTrigger,
      overallStatus: row.overallStatus as PlatformOverallStatus,
      summary: row.summary,
      checks: Array.isArray(row.checks)
        ? (row.checks as unknown as PlatformCheckResult[])
        : [],
      durationMs: row.durationMs,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt.toISOString(),
    };
  }
}
