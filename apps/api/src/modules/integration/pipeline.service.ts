import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  circuitAllows,
  currentTenant,
  dryRun,
  newId,
  recordCircuitResult,
  type CircuitSnapshot,
  type FieldMapping,
  type LookupTable,
  type TransformName,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { connector, connection, integrationFlow, fieldMapping, credential } = schema;

/**
 * CONNECTORS, CONNECTIONS AND FLOWS — the configuration half of INTEGRATION.
 *
 * The two decisions worth stating:
 *
 *  - **`fake` is a first-class adapter mode, not a test fixture.** It is how a demo, a
 *    drill and a chaos exercise run without touching a government sandbox, and it is the
 *    only way to inject a failure deliberately. A system whose outage handling can only be
 *    rehearsed by causing an outage never gets rehearsed.
 *
 *  - **The circuit breaker lives on the CONNECTION, not in memory.** An in-process breaker
 *    is not a breaker once there are two processes: each one discovers the same outage
 *    separately and the far side gets double the traffic it was being protected from.
 */
@Injectable()
export class PipelineService {
  constructor(private readonly audit: AuditLogService) {}

  async connectors(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(connector).where(eq(connector.isActive, true)).orderBy(asc(connector.code));
      return rows.map((r) => ({ code: r.code, name: r.name, category: r.category, protocol: r.protocol, direction: r.direction, capabilities: r.capabilities, status: r.status }));
    });
  }

  async connections(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(connection).where(eq(connection.isActive, true)).orderBy(asc(connection.name));
      const conns = await tx.select().from(connector);
      const creds = await tx.select().from(credential);
      const codeOf = new Map(conns.map((c) => [c.id, c.code]));
      const credOf = new Map(creds.map((c) => [c.id, c.label]));
      return rows.map((r) => ({
        name: r.name,
        connector: codeOf.get(r.connectorId) ?? r.connectorId,
        environment: r.environment,
        adapterMode: r.adapterMode,
        endpointUrl: r.endpointUrl,
        secondaryEndpointUrl: r.secondaryEndpointUrl,
        // The credential is named, never revealed. There is no column holding the secret.
        credential: r.credentialId ? credOf.get(r.credentialId) ?? "(configured)" : null,
        healthStatus: r.healthStatus,
        circuitState: r.circuitState,
        consecutiveFailures: r.consecutiveFailures,
        note:
          r.adapterMode === "fake"
            ? "Fake adapter: the whole pipeline runs, nothing leaves the building. This is how outages are rehearsed."
            : null,
      }));
    });
  }

  /** Whether a call to this connection may go out now — and the circuit transition if any. */
  async circuitCheck(connectionName: string, asOf?: string): Promise<Record<string, unknown>> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const conn = await this.connectionByName(tx, connectionName);
      const snapshot = this.snapshotOf(conn);
      const verdict = circuitAllows(snapshot, now);
      if (verdict.changed) await this.persistCircuit(tx, conn.id, verdict);
      return { connection: connectionName, ...verdict };
    });
  }

  /** Record the outcome of a call and move the breaker. */
  async recordOutcome(connectionName: string, outcome: "success" | "failure", asOf?: string): Promise<Record<string, unknown>> {
    const now = asOf ?? new Date().toISOString();
    return withTenant(async (tx) => {
      const conn = await this.connectionByName(tx, connectionName);
      const verdict = recordCircuitResult(this.snapshotOf(conn), outcome, now);
      await this.persistCircuit(tx, conn.id, verdict);
      if (verdict.changed && verdict.state === "open") {
        await this.audit.appendInTx(tx, {
          action: "integration.circuit.opened",
          entityType: "connection",
          entityId: conn.id,
          data: { connection: connectionName, consecutiveFailures: verdict.consecutiveFailures },
        });
      }
      return { connection: connectionName, ...verdict };
    });
  }

  private snapshotOf(conn: typeof connection.$inferSelect): CircuitSnapshot {
    return {
      state: conn.circuitState as CircuitSnapshot["state"],
      consecutiveFailures: conn.consecutiveFailures,
      consecutiveSuccesses: conn.consecutiveSuccesses,
      openedAt: conn.circuitOpenedAt ? conn.circuitOpenedAt.toISOString() : null,
    };
  }

  private async persistCircuit(tx: Tx, id: string, v: { state: string; consecutiveFailures: number; consecutiveSuccesses: number; openedAt: string | null }): Promise<void> {
    const { actorId } = currentTenant();
    await tx
      .update(connection)
      .set({
        circuitState: v.state,
        consecutiveFailures: v.consecutiveFailures,
        consecutiveSuccesses: v.consecutiveSuccesses,
        circuitOpenedAt: v.openedAt ? new Date(v.openedAt) : null,
        healthStatus: v.state === "open" ? "down" : v.state === "half_open" ? "degraded" : "healthy",
        lastHealthCheckAt: new Date(),
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(connection.id, id));
  }

  async connectionByName(tx: Tx, name: string) {
    const [c] = await tx.select().from(connection).where(eq(connection.name, name)).limit(1);
    if (!c) throw Errors.notFound(`connection ${name}`);
    return c;
  }

  /* --------------------------------- flows -------------------------------- */

  async flows(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(integrationFlow).where(eq(integrationFlow.isActive, true)).orderBy(asc(integrationFlow.code));
      const maps = await tx.select().from(fieldMapping).where(eq(fieldMapping.isActive, true));
      return rows.map((r) => ({
        code: r.code, name: r.name, triggerType: r.triggerType, canonicalEntity: r.canonicalEntity,
        status: r.status, pauseReason: r.pauseReason, isStatutory: r.isStatutory, slaMs: r.slaMs,
        mappingCount: maps.filter((m) => m.flowId === r.id).length,
      }));
    });
  }

  async mappingsFor(flowCode: string): Promise<FieldMapping[]> {
    return withTenant(async (tx) => this.mappingsInTx(tx, flowCode));
  }

  async mappingsInTx(tx: Tx, flowCode: string): Promise<FieldMapping[]> {
    const flow = await this.flowByCode(tx, flowCode);
    const rows = await tx
      .select()
      .from(fieldMapping)
      .where(and(eq(fieldMapping.flowId, flow.id), eq(fieldMapping.isActive, true)))
      .orderBy(asc(fieldMapping.seq));
    return rows.map((r) => ({
      seq: r.seq,
      sourcePath: r.sourcePath,
      canonicalPath: r.canonicalPath,
      targetPath: r.targetPath,
      transform: (r.transformName ?? null) as TransformName | null,
      defaultValue: r.defaultValue,
      isRequired: r.isRequired,
      lookupTable: (r.lookupTable ?? null) as LookupTable | null,
    }));
  }

  async flowByCode(tx: Tx, code: string) {
    const [f] = await tx.select().from(integrationFlow).where(eq(integrationFlow.code, code)).limit(1);
    if (!f) throw Errors.notFound(`flow ${code}`);
    return f;
  }

  /**
   * Dry-run a mapping over sample rows without sending anything.
   *
   * The point is to find the four things that are wrong before the first real message, not
   * after it — and to notice that they are usually one mis-typed source path rather than
   * four unrelated problems.
   */
  async preflight(flowCode: string, samples: readonly unknown[]): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const mappings = await this.mappingsInTx(tx, flowCode);
      if (mappings.length === 0) {
        throw new AppError("INT_NO_MAPPING", 422, `Flow ${flowCode} has no field mappings. A pre-flight over nothing would pass, which is worse than failing.`);
      }
      const result = dryRun(samples, mappings, LOOKUPS);
      return { flowCode, sampleCount: samples.length, ...result, sent: false };
    });
  }

  async pauseFlow(flowCode: string, reason: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!reason?.trim()) {
      throw new AppError("INT_PAUSE_REASON_REQUIRED", 422, "Pausing a flow needs a reason — a paused flow with no reason is one nobody dares restart.");
    }
    return withTenant(async (tx) => {
      const flow = await this.flowByCode(tx, flowCode);
      await tx.update(integrationFlow).set({ status: "paused", pauseReason: reason, updatedBy: actorId, updatedAt: new Date() }).where(eq(integrationFlow.id, flow.id));
      await this.audit.appendInTx(tx, { action: "integration.flow.paused", entityType: "integration_flow", entityId: flow.id, data: { flowCode, reason } });
      return { flowCode, status: "paused", reason };
    });
  }

  async resumeFlow(flowCode: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const flow = await this.flowByCode(tx, flowCode);
      await tx.update(integrationFlow).set({ status: "active", pauseReason: null, updatedBy: actorId, updatedAt: new Date() }).where(eq(integrationFlow.id, flow.id));
      await this.audit.appendInTx(tx, { action: "integration.flow.resumed", entityType: "integration_flow", entityId: flow.id, data: { flowCode } });
      return { flowCode, status: "active" };
    });
  }
}

/**
 * Reference data every mapping can look codes up in.
 *
 * `uqc_codes` in particular is why unmapped codes are a failure rather than a pass-through:
 * a plant that lets both `PCS` and `NOS` through ends up with two units for one thing, and
 * every stock report after that is quietly wrong.
 */
export const LOOKUPS: Partial<Record<LookupTable, Record<string, string>>> = {
  uqc_codes: { NOS: "NOS", PCS: "NOS", PC: "NOS", KGS: "KGS", KG: "KGS", MTR: "MTR", M: "MTR", LTR: "LTR", SET: "SET", BOX: "BOX" },
  gst_state_codes: { MH: "27", "27": "27", TN: "33", "33": "33", GJ: "24", "24": "24", KA: "29", "29": "29" },
  tally_ledger_map: { SALES: "Sales Accounts", PURCH: "Purchase Accounts", GSTOUT: "Duties & Taxes" },
};
