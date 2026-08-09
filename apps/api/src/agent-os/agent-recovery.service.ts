import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { db, schema } from "@ind-core/db";
import { runWithTenant } from "@ind-core/platform";
import { AgentGraphEngine } from "./agent-graph.engine.js";
import { AgentRunRepository } from "./agent-run.repository.js";

const { tenant } = schema;
const SYSTEM_ACTOR_ID = "0192a8c0-0000-7000-8000-0000000000ff";
const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 10_000;
const MAX_RUNS_PER_TENANT_SWEEP = 25;

/**
 * Tenant-aware liveness loop for pending runs and expired node leases. Every actual graph
 * resume runs under the mission creator's current RBAC authority; the system actor only
 * performs the metadata scan. Multiple API replicas may sweep safely because node/run
 * transitions remain token-bound CAS operations in PostgreSQL.
 */
@Injectable()
export class AgentRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRecoveryService.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private sweepInProgress = false;

  constructor(
    private readonly repository: AgentRunRepository,
    private readonly engine: AgentGraphEngine,
  ) {}

  onModuleInit(): void {
    if (process.env.AGENT_OS_RECOVERY_ENABLED === "false") return;
    const configured = Number(process.env.AGENT_OS_RECOVERY_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const intervalMs = Number.isFinite(configured)
      ? Math.max(MIN_INTERVAL_MS, configured)
      : DEFAULT_INTERVAL_MS;
    const initial = setTimeout(() => void this.sweep().catch((error) => {
      this.logger.error("Initial Agent OS recovery sweep failed.", error);
    }), 10_000);
    initial.unref();
    this.interval = setInterval(() => void this.sweep().catch((error) => {
      this.logger.error("Agent OS recovery sweep failed.", error);
    }), intervalMs);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async sweep(): Promise<{ status: "ok" | "already_running"; examined: number }> {
    if (this.sweepInProgress) return { status: "already_running", examined: 0 };
    this.sweepInProgress = true;
    let examined = 0;
    try {
      const tenants = await db.select({ id: tenant.id, isActive: tenant.isActive }).from(tenant);
      for (const item of tenants.filter((candidate) => String(candidate.isActive) === "true")) {
        const candidates = await runWithTenant(
          { tenantId: item.id, actorId: SYSTEM_ACTOR_ID, principal: "staff" },
          () => this.repository.recoveryCandidates(MAX_RUNS_PER_TENANT_SWEEP),
        );
        for (const candidate of candidates) {
          examined += 1;
          try {
            await runWithTenant(
              { tenantId: item.id, actorId: candidate.createdBy, principal: "staff" },
              () => this.engine.execute(candidate.id),
            );
          } catch (error) {
            // One malformed/unauthorised run cannot starve every other tenant/run. The
            // engine records controlled graph failures when it owns a valid transition.
            this.logger.warn(`Agent OS recovery skipped run ${candidate.id}: ${String(error)}`);
          }
        }
      }
      return { status: "ok", examined };
    } finally {
      this.sweepInProgress = false;
    }
  }
}
