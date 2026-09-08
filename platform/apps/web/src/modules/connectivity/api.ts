import { api } from "@spine/api/client";

export type ConnectorKind = "native" | "odoo" | "tally" | "sap" | "vyapar" | "generic";
export interface ConnectorType { kind: ConnectorKind; name: string; transport: string; mode: "read_only" | "import"; description: string; documentationUrl?: string }
export interface SnapshotSummary { id: string; observedAt: string; importedAt: string; counts: { orders: number; inventory: number; suppliers: number }; warnings: string[] }
export interface Connection { id: string; name: string; kind: ConnectorKind; baseUrl: string | null; status: string; hasCredentials: boolean; lastTestedAt: string | null; lastSyncedAt: string | null; lastError: string | null; settings: { database?: string; company?: string; entityPath?: string; entity?: string }; latestSnapshot: SnapshotSummary | null }
export interface Snapshot extends SnapshotSummary { evidence: { orders: { externalId: string; itemCode: string; quantity: number; dueDate: string | null }[]; inventory: { itemCode: string; availableQty: number | null; uom: string }[]; suppliers: { externalId: string; name: string; leadDays: number | null }[] } }
export async function mutate<T>(path: string, body: unknown): Promise<T> { return (await api.post<{ data: T }>(`/connectivity${path}`, body)).data; }
export function readableError(error: unknown): string { return error instanceof Error ? error.message : "The request could not be completed. Try again."; }
