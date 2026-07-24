import { Injectable } from "@nestjs/common";
import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  computeEntryHash,
  GENESIS_HASH,
  encodeCursor,
  decodeCursor,
  type AuditEntry,
  type CursorPage,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";

const { company, auditLog, outboxEvent } = schema;

export interface CreateCompanyInput {
  legalName: string;
  cin?: string;
}
export interface CompanyRow {
  id: string;
  legalName: string;
  cin: string | null;
  createdAt: string;
}

@Injectable()
export class GeneralService {
  /**
   * Create a company. This ONE transaction shows the binding platform pattern
   * (DECISIONS-V2 §5.4/§5.5/§3.3) that every module repeats:
   *   1. the domain write (company)
   *   2. the hash-chained audit entry (append-only, tamper-evident)
   *   3. the outbox event (staged in the SAME tx — never lost, never on the bus alone)
   * All three commit atomically, fenced to the current tenant by SET LOCAL + RLS.
   */
  /**
   * Create a company, exactly once per Idempotency-Key. The real work runs through
   * the no-duplicates notebook: a retried request with the same key returns the
   * first company instead of creating a second one.
   */
  async createCompany(input: CreateCompanyInput, idempotencyKey: string): Promise<CompanyRow> {
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreateCompany(input),
    }));
    return result.body;
  }

  private async doCreateCompany(input: CreateCompanyInput): Promise<CompanyRow> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();

    return withTenant(async (tx) => {
      const id = newId();

      // 1. domain write
      await tx.insert(company).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        legalName: input.legalName,
        cin: input.cin ?? null,
      });

      // 2. hash-chained audit entry. Serialise the per-tenant chain with a
      //    transaction-scoped advisory lock — audit_log is append-only, so app_user
      //    has no UPDATE privilege and therefore cannot `SELECT ... FOR UPDATE` it.
      //    The lock is keyed on the tenant and auto-releases at COMMIT.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);
      const [last] = await tx
        .select({ seq: auditLog.seq, hash: auditLog.hash })
        .from(auditLog)
        .where(eq(auditLog.tenantId, tenantId))
        .orderBy(desc(auditLog.seq))
        .limit(1);
      const seq = (last?.seq ?? -1) + 1;
      const prevHash = last?.hash ?? GENESIS_HASH;
      const entry: AuditEntry = {
        tenantId,
        seq,
        actorId,
        action: "general.company.created",
        entityType: "company",
        entityId: id,
        data: { legalName: input.legalName, cin: input.cin ?? null },
        at: now.toISOString(),
      };
      await tx.insert(auditLog).values({
        id: newId(),
        tenantId,
        seq,
        actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: id,
        data: entry.data,
        at: now,
        prevHash,
        hash: computeEntryHash(prevHash, entry),
      });

      // 3. outbox event (side-effect fan-out; consumers are idempotent)
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("general", "company", "created"),
        payload: { id, legalName: input.legalName },
        createdAt: now,
      });

      return { id, legalName: input.legalName, cin: input.cin ?? null, createdAt: now.toISOString() };
    });
  }

  /** List active companies, cursor-paginated on (created_at, id) — §5.3. */
  async listCompanies(limit: number, cursor?: string): Promise<CursorPage<CompanyRow>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({
          id: company.id,
          legalName: company.legalName,
          cin: company.cin,
          createdAt: company.createdAt,
        })
        .from(company)
        .where(
          keyset
            ? and(
                eq(company.isActive, true),
                or(
                  gt(company.createdAt, new Date(keyset.createdAt)),
                  and(
                    eq(company.createdAt, new Date(keyset.createdAt)),
                    gt(company.id, keyset.id),
                  ),
                ),
              )
            : eq(company.isActive, true),
        )
        .orderBy(company.createdAt, company.id)
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;

      return {
        items: page.map((r) => ({
          id: r.id,
          legalName: r.legalName,
          cin: r.cin,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor,
      };
    });
  }
}
