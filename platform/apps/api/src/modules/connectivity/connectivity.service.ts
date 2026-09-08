import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import { currentTenant, newId, Errors } from "@ind-core/platform";
import { z } from "zod";
import { AuditLogService } from "../../common/audit-log.service.js";
import { CONNECTOR_CATALOG, readExternalEvidence, type ReadEvidence } from "./adapters.js";
import { connectionCreate, connectionSettings, connectorKind, parseImport, type importRequest, type commitmentRequest, type recoveryRequest, type outcomeRequest, type Evidence } from "./contracts.js";
import { decryptCredentials, encryptCredentials, validateConnectorUrl } from "./connector-security.js";
import { readNativeEvidence } from "./native-adapter.js";
import { assessCommitment, compareRecovery, compareOutcomes } from "./decision-rules.js";
import { answerFromEvidence } from "./grounded-answers.js";

const { manufacturingConnection: connections, manufacturingSnapshot: snapshots, manufacturingDecision: decisions, manufacturingOutcome: outcomes } = schema;
type Connection = typeof connections.$inferSelect;
type Snapshot = typeof snapshots.$inferSelect;
function actor() { const { tenantId, actorId } = currentTenant(); return { tenantId, createdBy: actorId, updatedBy: actorId }; }
function counts(evidence: Evidence) { return { orders: evidence.orders.length, inventory: evidence.inventory.length, suppliers: evidence.suppliers.length }; }
function safeFailure(error: unknown) {
  if (error instanceof SyntaxError || error instanceof z.ZodError) return "Source records do not match the connector contract. Review the source mapping and export format.";
  if (error instanceof Error && !error.message.includes("\n") && error.message.length < 400) return error.message;
  return "Connection failed. Review the endpoint, source permissions, network access and import format.";
}
function snapshotSummary(row: Snapshot) {
  const evidence = row.evidence as Evidence;
  return { id: row.id, observedAt: row.observedAt.toISOString(), importedAt: row.createdAt.toISOString(), counts: counts(evidence), warnings: row.warnings as string[] };
}

@Injectable()
export class ConnectivityService {
  constructor(private readonly audit: AuditLogService) {}
  catalog() { return CONNECTOR_CATALOG; }

  async list() {
    const rows = await withTenant((tx) => tx.select().from(connections).where(eq(connections.isActive, true)).orderBy(desc(connections.createdAt)).limit(100));
    const result = [];
    for (const row of rows) {
      const latest = await this.latest(row.id);
      result.push({ id: row.id, name: row.name, kind: row.kind, baseUrl: row.baseUrl, settings: row.settings,
        status: row.status, hasCredentials: Boolean(row.credentialsEncrypted), lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null, lastError: row.lastError, latestSnapshot: latest ? snapshotSummary(latest) : null });
    }
    return result;
  }

  async create(input: z.infer<typeof connectionCreate>) {
    const id = newId(); const context = actor();
    if (["odoo", "tally", "sap"].includes(input.kind)) {
      if (!input.baseUrl) throw Errors.validation([{ field: "baseUrl", message: "This connector requires an endpoint" }]);
      try { validateConnectorUrl(input.baseUrl); } catch (error) { throw Errors.validation([{ field: "baseUrl", message: safeFailure(error) }]); }
    } else if (input.baseUrl || input.credentials) throw Errors.validation([{ field: "kind", message: "Native and file-import connections do not use remote endpoints or credentials" }]);
    let credentialsEncrypted: string | null = null;
    if (input.credentials) {
      try { credentialsEncrypted = encryptCredentials(input.credentials, `${context.tenantId}:${id}`); }
      catch (error) { throw Errors.validation([{ field: "credentials", message: safeFailure(error) }]); }
    }
    const status = input.kind === "vyapar" || input.kind === "generic" ? "import_ready" : "configured";
    await withTenant(async (tx) => {
      await tx.insert(connections).values({ id, ...context, name: input.name, kind: input.kind, baseUrl: input.baseUrl ?? null, credentialsEncrypted, settings: input.settings, status });
      await this.audit.appendInTx(tx, { action: "connectivity.connection.created", entityType: "manufacturing_connection", entityId: id, data: { name: input.name, kind: input.kind, hasCredentials: Boolean(credentialsEncrypted) } });
    });
    return { id, name: input.name, kind: input.kind, status };
  }

  private async connection(id: string) {
    const [row] = await withTenant((tx) => tx.select().from(connections).where(and(eq(connections.id, id), eq(connections.isActive, true))).limit(1));
    if (!row) throw Errors.notFound("manufacturing connection"); return row;
  }
  private async latest(id: string) {
    const [row] = await withTenant((tx) => tx.select().from(snapshots).where(eq(snapshots.connectionId, id)).orderBy(desc(snapshots.createdAt), desc(snapshots.id)).limit(1));
    return row ?? null;
  }
  async snapshot(id: string) {
    await this.connection(id); const row = await this.latest(id);
    return row ? { ...snapshotSummary(row), evidence: row.evidence as Evidence } : null;
  }
  private async read(row: Connection): Promise<ReadEvidence> {
    if (row.kind === "native") return readNativeEvidence();
    return readExternalEvidence({ kind: connectorKind.parse(row.kind), baseUrl: row.baseUrl, settings: connectionSettings.parse(row.settings),
      credentials: decryptCredentials(row.credentialsEncrypted, `${currentTenant().tenantId}:${row.id}`) });
  }
  async test(id: string) {
    const row = await this.connection(id); let status: "connected" | "failed" | "import_ready" = "connected";
    let detail = "Read-only source access and normalized record format verified. Synchronize to save evidence.";
    if (row.kind === "vyapar" || row.kind === "generic") { status = "import_ready"; detail = "Import connection is ready. No remote service was contacted."; }
    else { try { await this.read(row); } catch (error) { status = "failed"; detail = safeFailure(error); } }
    await withTenant(async (tx) => {
      await tx.update(connections).set({ status, lastTestedAt: new Date(), lastError: status === "failed" ? detail : null, updatedAt: new Date(), updatedBy: currentTenant().actorId }).where(eq(connections.id, id));
      await this.audit.appendInTx(tx, { action: "connectivity.connection.tested", entityType: "manufacturing_connection", entityId: id, data: { status, detail } });
    });
    return { status, detail };
  }
  private async save(row: Connection, read: ReadEvidence, observedAt: Date, imported = false) {
    const id = newId(); const now = new Date(); const fingerprint = createHash("sha256").update(JSON.stringify({ observedAt: observedAt.toISOString(), evidence: read.evidence })).digest("hex");
    const inserted = await withTenant(async (tx) => {
      const [snapshot] = await tx.insert(snapshots).values({ id, ...actor(), connectionId: row.id, observedAt, evidence: read.evidence, warnings: read.warnings, fingerprint }).returning();
      await tx.update(connections).set({ status: imported ? row.status : "connected", lastSyncedAt: now, lastError: imported ? row.lastError : null, updatedAt: now, updatedBy: currentTenant().actorId }).where(eq(connections.id, row.id));
      await this.audit.appendInTx(tx, { action: "connectivity.snapshot.imported", entityType: "manufacturing_snapshot", entityId: id, data: { connectionId: row.id, observedAt: observedAt.toISOString(), fingerprint, counts: counts(read.evidence), warnings: read.warnings } });
      return snapshot!;
    });
    return { ...snapshotSummary(inserted), evidence: read.evidence };
  }
  async sync(id: string) {
    const row = await this.connection(id);
    if (row.kind === "vyapar" || row.kind === "generic") throw Errors.validation([{ field: "kind", message: "Use CSV or JSON import for this connection" }]);
    let read: ReadEvidence;
    try { read = await this.read(row); }
    catch (error) {
      const detail = safeFailure(error);
      await withTenant(async (tx) => {
        await tx.update(connections).set({ status: "failed", lastError: detail, updatedAt: new Date(), updatedBy: currentTenant().actorId }).where(eq(connections.id, id));
        await this.audit.appendInTx(tx, { action: "connectivity.sync.failed", entityType: "manufacturing_connection", entityId: id, data: { detail } });
      });
      throw Errors.validation([{ field: "connection", message: detail }]);
    }
    return this.save(row, read, new Date());
  }
  async import(id: string, input: z.infer<typeof importRequest>) {
    const row = await this.connection(id); let evidence: Evidence;
    try { evidence = parseImport(input); } catch (error) { throw Errors.validation([{ field: "content", message: safeFailure(error) }]); }
    const warnings = ["Imported evidence is user supplied. Quantities must be reconciled for reservations and source units before committing.",
      ...(["orders", "inventory", "suppliers"] as const).filter((key) => !evidence[key].length).map((key) => `No ${key} records supplied; this dimension is unknown.`)];
    return this.save(row, { evidence, warnings }, new Date(input.observedAt), true);
  }
  private async decisionSnapshot(connectionId: string) {
    await this.connection(connectionId); const row = await this.latest(connectionId);
    if (!row) throw Errors.validation([{ field: "connectionId", message: "Synchronize or import manufacturing evidence first" }]);
    return { id: row.id, observedAt: row.observedAt, evidence: row.evidence as Evidence, warnings: row.warnings as string[] };
  }
  private async saveDecision(type: "commitment" | "recovery", connectionId: string, snapshotId: string, request: object, result: object) {
    const id = newId(); await withTenant(async (tx) => {
      await tx.insert(decisions).values({ id, ...actor(), connectionId, snapshotId, decisionType: type, request, result });
      await this.audit.appendInTx(tx, { action: `connectivity.decision.${type}`, entityType: "manufacturing_decision", entityId: id, data: { connectionId, snapshotId, result } });
    }); return { id, ...result };
  }
  async commitment(input: z.infer<typeof commitmentRequest>) {
    const snapshot = await this.decisionSnapshot(input.connectionId);
    return this.saveDecision("commitment", input.connectionId, snapshot.id, input, assessCommitment(input, snapshot));
  }
  async recovery(input: z.infer<typeof recoveryRequest>) {
    const snapshot = await this.decisionSnapshot(input.connectionId);
    return this.saveDecision("recovery", input.connectionId, snapshot.id, input, compareRecovery(input, snapshot));
  }
  async recentDecisions() {
    return withTenant((tx) => tx.select({ id: decisions.id, decisionType: decisions.decisionType, result: decisions.result, createdAt: decisions.createdAt }).from(decisions).orderBy(desc(decisions.createdAt)).limit(20));
  }
  async ask(id: string, question: string) {
    const snapshot = await this.decisionSnapshot(id);
    const result = answerFromEvidence(question, snapshot);
    await withTenant((tx) => this.audit.appendInTx(tx, { action: "connectivity.question.answered", entityType: "manufacturing_snapshot", entityId: snapshot.id,
      data: { connectionId: id, question, ...result } }));
    return result;
  }
  async recordOutcome(input: z.infer<typeof outcomeRequest>) {
    if (input.kind !== "estimate" && input.periodEnd > new Date().toISOString().slice(0, 10)) throw Errors.validation([{ field: "periodEnd", message: "Baseline and actual measurements cannot cover a future period" }]);
    const id = newId(); await withTenant(async (tx) => {
      await tx.insert(outcomes).values({ id, ...actor(), measurement: input });
      await this.audit.appendInTx(tx, { action: "connectivity.outcome.recorded", entityType: "manufacturing_outcome", entityId: id, data: input });
    }); return { id, ...input };
  }
  async outcomeSummary() {
    const rows = await withTenant((tx) => tx.select().from(outcomes).orderBy(desc(outcomes.createdAt)).limit(200));
    const entries = rows.map((r) => ({ id: r.id, ...r.measurement as z.infer<typeof outcomeRequest> }));
    return { entries, comparisons: compareOutcomes(entries), methodology: "User-recorded measurements, referenced to source evidence. Only equal-length, non-overlapping baseline and actual periods are compared; estimates are excluded. This comparison does not establish causation." };
  }
}
