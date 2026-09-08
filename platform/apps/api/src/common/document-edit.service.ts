import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { currentTenant, AppError, Errors, editPolicy, checkEdit } from "@ind-core/platform";

import type { ChangeSet, EditVerdict } from "@ind-core/platform";
import type { Tx } from "@ind-core/db";
import { AuditLogService } from "./audit-log.service.js";

/**
 * Any RFC-4122 shape, not `isUuidV7`. The check exists to keep a malformed string away from
 * Postgres, not to police which version a legitimately-stored id happens to be — and some
 * seeded fixtures pre-date the UUIDv7 rule.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/**
 * THE ONE PLACE A DOCUMENT IS CORRECTED.
 *
 * Twenty-odd modules each needed the same six steps to let a user fix a mistake: lock the
 * row, ask whether its state permits the change, keep only the fields that actually moved,
 * bump the revision when someone had already relied on the document, write the before/after
 * into the hash chain, and refuse cleanly when any of that fails.
 *
 * Six steps copied twenty times is six steps that will be five somewhere. The step most
 * likely to be dropped is the audit append — it is the only one whose absence nothing
 * visibly breaks, and it is the entire reason an edit path is safe to offer at all.
 *
 * So the steps live here, and a module's edit endpoint is a lock, a mapper and a call.
 *
 * WHY THE ROW IS LOCKED FIRST. Two people correcting the same order is not exotic — it is
 * a plant head and a sales clerk reacting to the same phone call. Without `FOR UPDATE`
 * both read revision 3, both write 4, and one operator's stated reason disappears with
 * nothing recording that it was ever given. The database trigger from migration 0089
 * catches the revision collision; this lock stops it happening.
 */

export interface EditRequest<T extends Record<string, unknown>> {
  /** `module.entity` — the key the edit policy and the audit trail both use. */
  docType: string;
  /** The document's id, for the lock, the audit row and the error messages. */
  id: string;
  /** The row as it is now. Must include the status column. */
  before: T;
  /** The document's current status, read from `before`. */
  status: string;
  /** Only the fields the caller wants to change. Absent means "leave alone". */
  patch: Partial<T>;
  /** Which fields may be compared and written. Anything outside this is ignored. */
  editableFields: readonly string[];
  /** The operator's stated reason. Required when the policy says `amend`. */
  reason?: string | null;
}

export interface EditOutcome {
  /** False when nothing moved — the caller should skip its UPDATE entirely. */
  changed: boolean;
  /** `open` or `amend`; drives the audit verb and whether a revision is spent. */
  tier: "open" | "amend";
  /** The revision the document should now carry. Unchanged for an `open` edit. */
  revisionNo: number;
  /** True when the caller must send the document back through approval. */
  reapprovalRequired: boolean;
  /** What moved, already redacted where the field is sensitive. */
  changeSet: ChangeSet | null;
  /**
   * The columns to write, ready to spread into `.set({...})`. Contains only the fields
   * that moved, plus the four amendment columns when this is an amendment.
   */
  columns: Record<string, unknown>;
}

@Injectable()
export class DocumentEditService {
  constructor(private readonly audit: AuditLogService) {}

  /**
   * May this document be edited at all, and on what terms?
   *
   * Pure — no database, no transaction. The UI calls this through a read endpoint to
   * decide whether the Edit button is live and what to say when it is not, so a user
   * learns "this PO is approved, amending it goes back for approval" from the button
   * rather than from a 409 after filling in a form.
   */
  policy(docType: string, status: string): EditVerdict {
    return editPolicy(docType, status);
  }

  /**
   * A document id that Postgres will accept as a uuid, or a clean 404.
   *
   * Every edit-policy endpoint takes an id straight from the path, and a path segment is
   * whatever the client sent. Passing "browser-demo-purchase-order" into a `uuid` comparison
   * raises `invalid input syntax for type uuid`, which escapes as a 500 — a SERVER error for
   * a CLIENT mistake, and one that shows up in monitoring as if the database were broken.
   *
   * Caught here rather than in twelve controllers: this is the one function every one of
   * them already calls into, and a rule enforced in one place is a rule that holds.
   */
  requireDocumentId(id: string, what: string): string {
    if (!UUID_SHAPE.test(id)) throw Errors.notFound(`${what} '${id}'`);
    return id;
  }

  /**
   * Take the row lock before reading, so the read that decides the revision is the read
   * that keeps it. Returns nothing — the caller does its own typed SELECT afterwards,
   * which is now protected.
   *
   * Table name is interpolated rather than parameterised because it is a table name; every
   * caller passes a compile-time literal from the schema, never anything user-supplied.
   */
  async lock(tx: Tx, table: string, id: string): Promise<void> {
    const { tenantId } = currentTenant();
    await tx.execute(
      sql`select 1 from ${sql.identifier(table)} where tenant_id = ${tenantId}::uuid and id = ${id}::uuid for update`,
    );
  }

  /**
   * Decide the edit, write the audit, and hand back the columns to persist.
   *
   * Does NOT perform the UPDATE. The module owns its own table and its own invariants —
   * recomputing an order's tax after a quantity change is Sales' business, not this
   * service's — so the split is: this decides and records, the module writes.
   *
   * Returns `changed: false` when no field moved. The caller should then do nothing:
   * no UPDATE, no event, no audit row. Someone opening a form and pressing Save is not an
   * amendment, and spending a revision number on it would tell a vendor their PO changed
   * when it did not.
   */
  async apply<T extends Record<string, unknown>>(
    tx: Tx,
    req: EditRequest<T>,
  ): Promise<EditOutcome> {
    const refusal = checkEdit(req.docType, req.status, req.reason);
    if (refusal) {
      throw new AppError(refusal.code, refusal.httpStatus, refusal.message, [
        { field: "status", message: `correct this by: ${refusal.correctBy}` },
      ]);
    }

    const verdict = editPolicy(req.docType, req.status);
    const tier = verdict.tier === "amend" ? "amend" : "open";

    // Only fields the module declared editable. A patch key outside this list is dropped
    // rather than refused: clients legitimately echo back a whole document, and failing
    // on `id` or `createdAt` would make every round-trip edit a 422.
    const patch: Record<string, unknown> = {};
    for (const field of req.editableFields) {
      if (field in req.patch) patch[field] = (req.patch as Record<string, unknown>)[field];
    }

    const currentRevision = Number(req.before.revisionNo ?? 0);
    const nextRevision = tier === "amend" ? currentRevision + 1 : currentRevision;

    const written = await this.audit.appendEditInTx(tx, {
      docType: req.docType,
      entityId: req.id,
      before: req.before,
      after: patch,
      fields: req.editableFields,
      tier,
      reason: req.reason,
      revisionNo: tier === "amend" ? nextRevision : undefined,
    });

    if (!written) {
      return {
        changed: false,
        tier,
        revisionNo: currentRevision,
        reapprovalRequired: false,
        changeSet: null,
        columns: {},
      };
    }

    const { actorId } = currentTenant();
    const now = new Date();

    // Only the fields that actually moved are written back. Writing the whole patch would
    // stamp `updated_by` onto columns nobody touched, which makes the row's own history
    // disagree with the change set the audit trail holds.
    const moved = new Set(written.changeSet.changes.map((c) => c.field));
    const columns: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(patch)) {
      if (moved.has(field)) columns[field] = value;
    }

    columns.updatedAt = now;
    columns.updatedBy = actorId;

    if (tier === "amend") {
      columns.revisionNo = nextRevision;
      columns.amendedAt = now;
      columns.amendedBy = actorId;
      columns.amendReason = req.reason?.trim();
    }

    return {
      changed: true,
      tier,
      revisionNo: nextRevision,
      reapprovalRequired: verdict.reapprovalRequired,
      changeSet: written.changeSet,
      columns,
    };
  }

  /**
   * Every correction ever made to one document, newest first.
   *
   * Guarded by the DOCUMENT's own read permission at the controller, not by the audit
   * permission: a sales clerk who may read SO-0007 may see that its quantity was changed
   * from 120 to 96 and why. Requiring `admin.audit.read` to answer "what changed on my own
   * order" would push people back to asking over WhatsApp.
   */
  async history(docType: string, id: string, limit = 50) {
    return this.audit.historyFor(docType, id, limit);
  }
}

/**
 * The refusal a CLOSED document produces, as a throwable — for the modules whose "edit"
 * endpoint exists only to explain why there isn't one (posted vouchers, GRNs, stock
 * entries). Giving those a real endpoint that always refuses is better than giving them no
 * endpoint at all: a 404 tells a client the route is wrong, while this tells the user what
 * to do instead.
 */
export function refuseEdit(docType: string, status: string): never {
  const verdict = editPolicy(docType, status);
  throw new AppError("DOCUMENT_NOT_EDITABLE", 409, verdict.reason, [
    { field: "status", message: `correct this by: ${verdict.correctBy}` },
  ]);
}

/** Re-exported so a module imports one thing to build an edit endpoint. */
export { editPolicy, and, eq };
