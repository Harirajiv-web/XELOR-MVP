import { Injectable } from "@nestjs/common";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  detectDuplicates,
  type DuplicateMatch,
  type MasterRecord,
  type CursorPage,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DedupExplainer } from "../../ai/dedup-explainer.js";

const { vendor, outboxEvent } = schema;

export interface CreateVendorInput {
  code: string;
  name: string;
  gstin?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  paymentTerms?: string;
}
export interface VendorRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  createdAt: string;
}
export type CreateVendorResult =
  | { outcome: "created"; vendor: VendorRow }
  | {
      outcome: "duplicate_suspected";
      candidate: MasterRecord;
      matches: DuplicateMatch[];
      explanation: string;
      degraded: boolean;
    };

/**
 * PURCHASE — vendor master (this file), plus purchase orders and goods receipts (added
 * alongside). Vendor creation reuses the shared master-dedup brain exactly like GENERAL
 * companies and ENGINEERING items: draft a duplicate concern for a human, then write in
 * one tenant-fenced transaction with hash-chained audit + outbox event.
 */
@Injectable()
export class PurchaseService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly dedup: DedupExplainer,
  ) {}

  async createVendor(
    input: CreateVendorInput,
    idempotencyKey: string,
    acknowledgeDuplicates = false,
  ): Promise<CreateVendorResult> {
    if (!acknowledgeDuplicates) {
      const { candidate, matches } = await this.findDuplicateVendors(input);
      if (matches.length > 0) {
        const { text, degraded } = await this.dedup.explain({
          candidate,
          matches,
          fieldLabels: { gstin: "GSTIN", cin: "vendor code", legal_name: "name" },
        });
        return { outcome: "duplicate_suspected", candidate, matches, explanation: text, degraded };
      }
    }
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreateVendor(input),
    }));
    return { outcome: "created", vendor: result.body };
  }

  /** A vendor maps onto MasterRecord as { name, gstin, code }. */
  private async findDuplicateVendors(
    input: CreateVendorInput,
  ): Promise<{ candidate: MasterRecord; matches: DuplicateMatch[] }> {
    const candidate: MasterRecord = {
      legalName: input.name,
      gstin: input.gstin ?? null,
      cin: input.code,
    };
    const rows = await withTenant(async (tx) => {
      const res = await tx.execute<{ id: string; code: string; name: string; gstin: string | null }>(sql`
        select id, code, name, gstin from vendor
        where is_active = true
          and ( code = ${input.code}
                or (${input.gstin ?? null}::text is not null and gstin = ${input.gstin ?? null})
                or similarity(name, ${input.name}) > 0.3 )
        limit 25
      `);
      return res.rows;
    });
    const existing: MasterRecord[] = rows.map((r) => ({
      id: r.id,
      legalName: r.name,
      gstin: r.gstin,
      cin: r.code,
    }));
    return { candidate, matches: detectDuplicates(candidate, existing) };
  }

  private async doCreateVendor(input: CreateVendorInput): Promise<VendorRow> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(vendor).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        code: input.code,
        name: input.name,
        gstin: input.gstin ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        address: input.address ?? null,
        paymentTerms: input.paymentTerms ?? null,
      });
      await this.audit.appendInTx(tx, {
        action: "purchase.vendor.created",
        entityType: "vendor",
        entityId: id,
        data: { code: input.code, name: input.name },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("purchase", "vendor", "created"),
        payload: { id, code: input.code, name: input.name },
        createdAt: now,
      });
      return { id, code: input.code, name: input.name, gstin: input.gstin ?? null, createdAt: now.toISOString() };
    });
  }

  async listVendors(limit: number, cursor?: string): Promise<CursorPage<VendorRow>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({ id: vendor.id, code: vendor.code, name: vendor.name, gstin: vendor.gstin, createdAt: vendor.createdAt })
        .from(vendor)
        .where(
          keyset
            ? and(
                eq(vendor.isActive, true),
                or(
                  gt(vendor.createdAt, new Date(keyset.createdAt)),
                  and(eq(vendor.createdAt, new Date(keyset.createdAt)), gt(vendor.id, keyset.id)),
                ),
              )
            : eq(vendor.isActive, true),
        )
        .orderBy(asc(vendor.createdAt), asc(vendor.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;
      return {
        items: page.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          gstin: r.gstin,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
    });
  }
}
