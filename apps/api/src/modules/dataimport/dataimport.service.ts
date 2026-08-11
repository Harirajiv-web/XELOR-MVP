import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import {
  AppError,
  Errors,
  IMPORT_TARGETS,
  applyColumnMapping,
  currentTenant,
  decodeCursor,
  displayCells,
  encodeCursor,
  groupImportRows,
  importTarget,
  inferSheetHeaders,
  isAdvisory,
  newId,
  sampleRows,
  sheetRows,
  suggestColumnMapping,
  unmappedColumns,
  unmappedRequiredFields,
  validateImportRow,
  type ColumnMapping,
  type CursorPage,
  type ImportTargetKey,
  type ImportTargetSpec,
  type RowGroup,
  type RowIssue,
  type SheetRow,
} from "@ind-core/platform";
import { DomainApiClient, type ForwardedCredentials } from "./domain-client.js";
import {
  LOOKUP_SOURCES,
  stockReceiptRef,
  targetHandler,
  type LookupKind,
  type ReferenceBook,
  type ReferenceEntry,
} from "./targets.js";
import { decodeWorkbook, sheetByName, type DecodedWorkbook } from "./workbook.js";

const { dataImportBatch, dataImportRow } = schema;

/**
 * SPREADSHEET IMPORT AS AN INTEGRATION PATH, NOT AN ONBOARDING SCRIPT.
 *
 * Three endpoints, and the split between them is the design:
 *
 *   INSPECT   read the file, say what is in it. No decisions, no writes. This is where an
 *             operator finds out they uploaded last year's file.
 *   VALIDATE  apply a mapping and report, row by row, what would happen and what is wrong.
 *             Still no writes. Every refusal names the spreadsheet row and quotes the cell.
 *   COMMIT    create the batch, then push the accepted rows through the domain endpoints.
 *
 * VALIDATE IS RUN AGAIN INSIDE COMMIT, AND THE CLIENT'S OPINION OF WHICH ROWS WERE VALID IS
 * NEVER ACCEPTED. Not because the wizard is malicious — because it is a separate request
 * against a database that has moved on. Between the two calls somebody may have created the
 * part the file names, or deactivated the warehouse it posts to. The file is the input; the
 * verdict is always the server's, and it is always current.
 *
 * WHY COMMIT IS NOT WRAPPED IN `runIdempotent`.
 * The platform's idempotency ledger replays a completed answer and wedges a `pending` key if
 * the process dies mid-work — deliberately, because for a journal voucher a stuck 409 is
 * cheaper than a double post. An import wants the opposite behaviour: what a dropped
 * connection leaves behind is WORK TO FINISH, not an answer to repeat. So the durable
 * identity here is the batch's content hash — the same bytes, mapped the same way, to the
 * same target — and re-posting resumes the batch, skipping the rows that already landed.
 * The per-ROW writes still go through the ledger under deterministic keys, so the layer that
 * actually touches a master is protected exactly as it is everywhere else.
 */
@Injectable()
export class DataImportService {
  constructor(private readonly domain: DomainApiClient) {}

  /* --------------------------------- targets -------------------------------- */

  /**
   * The catalogue the wizard draws its mapping controls from.
   *
   * Served rather than duplicated: the web app cannot import this package's barrel (it
   * reaches `node:async_hooks` through the tenant context and will not bundle for a
   * browser), and a second hand-written copy of the field list is how a file starts
   * validating in the wizard and failing on commit.
   */
  targets(): { targets: readonly ImportTargetSpec[] } {
    return { targets: IMPORT_TARGETS };
  }

  /* --------------------------------- inspect -------------------------------- */

  async inspect(input: {
    fileBase64: string;
    filename: string;
    sheet?: string;
    target?: ImportTargetKey;
  }): Promise<unknown> {
    const book = decodeWorkbook(input.fileBase64);
    const sheets = book.sheets.map((s) => {
      const header = inferSheetHeaders(s.matrix);
      return {
        name: s.name,
        headers: header.headers,
        rowCount: sheetRows(s.matrix, header).length,
      };
    });

    const chosenName = input.sheet ?? sheets[0]?.name ?? "";
    const chosen = input.sheet ? sheetByName(book, input.sheet) : book.sheets[0]!;
    const header = inferSheetHeaders(chosen.matrix);
    const rows = sheetRows(chosen.matrix, header);

    const spec = input.target ? this.spec(input.target) : null;
    const mapping = spec ? suggestColumnMapping(header.headers, spec) : null;

    return {
      source: this.sourceOf(book, input.filename),
      sheets,
      selectedSheet: chosenName,
      headerRowNo: header.headerRowIndex < 0 ? null : header.headerRowIndex + 1,
      headers: header.headers,
      rowCount: rows.length,
      sampleRows: sampleRows(rows).map((r) => ({ rowNo: r.rowNo, cells: displayCells(r) })),
      ...(spec && mapping
        ? {
            target: spec.key,
            suggestedMapping: mapping,
            unmappedColumns: unmappedColumns(header.headers, mapping),
            missingRequiredFields: unmappedRequiredFields(spec, mapping),
          }
        : {}),
    };
  }

  /* -------------------------------- validate -------------------------------- */

  async validate(
    input: {
      fileBase64: string;
      filename: string;
      sheet: string;
      target: ImportTargetKey;
      mapping: ColumnMapping;
    },
    creds: ForwardedCredentials,
  ): Promise<unknown> {
    const assessment = await this.assess(input, creds);
    return {
      source: assessment.source,
      target: input.target,
      sheet: input.sheet,
      rowCount: assessment.rows.length,
      acceptedCount: assessment.rows.filter((r) => r.accepted).length,
      rejectedCount: assessment.rows.filter((r) => !r.accepted).length,
      documentCount: assessment.groups.filter((g) => g.accepted).length,
      unmappedColumns: assessment.unmappedColumns,
      missingRequiredFields: assessment.missingRequired,
      rows: assessment.rows.map((r) => ({
        rowNo: r.rowNo,
        status: r.accepted ? "accepted" : "rejected",
        groupKey: r.groupKey,
        issues: r.issues,
        values: r.values,
      })),
    };
  }

  /* --------------------------------- commit --------------------------------- */

  async commit(
    input: {
      fileBase64: string;
      filename: string;
      sheet: string;
      target: ImportTargetKey;
      mapping: ColumnMapping;
      onDuplicate: "skip" | "import_anyway";
    },
    creds: ForwardedCredentials,
  ): Promise<unknown> {
    const spec = this.spec(input.target);
    const assessment = await this.assess(input, creds);
    if (assessment.missingRequired.length > 0) {
      throw Errors.validation(
        assessment.missingRequired.map((f) => ({
          field: f,
          message: "required by this target and no column is mapped to it",
        })),
      );
    }

    const contentHash = this.contentHash(assessment.book, input);
    const batch = await this.openBatch(contentHash, input, assessment);

    // A prior pass can have closed as partial/failed while a row was deliberately left
    // `accepted` because the domain idempotency key was still in progress. Re-open only in
    // that case. Imported/rejected/held rows remain terminal, so a retry can never create a
    // document twice or silently walk past a validation/duplicate decision.
    if (!(await this.prepareBatchForCommit(batch.id))) {
      return this.batchDetail(batch.id);
    }

    const handler = targetHandler(input.target);
    const acknowledge = input.onDuplicate === "import_anyway";

    // Read ONCE, before the loop, rather than per group.
    //
    // A resume needs to know which rows are still outstanding, and asking the database that
    // question per group turned a 400-row import into 400 queries each scanning the whole
    // batch. The set only shrinks as this loop works, so it can be maintained here.
    const pendingKeys = await this.pendingRows(batch.id);

    for (const group of assessment.groups) {
      if (!group.accepted) continue;
      const rowNos = group.group.rows.map((r) => r.rowNo);
      const pending = rowNos
        .filter((rowNo) => pendingKeys.has(rowNo))
        .map((rowNo) => ({ rowNo, idempotencyKey: pendingKeys.get(rowNo)! }));
      if (pending.length === 0) continue; // already imported on an earlier attempt

      const leader = pending.reduce((min, r) => (r.rowNo < min.rowNo ? r : min), pending[0]!);
      const request = handler.build(group.group, assessment.refs, acknowledge);
      const response = await this.domain.post<unknown>(
        request.path,
        request.body,
        // The GROUP's key is the leader row's key. Deterministic, so a resumed group replays
        // through the platform's ledger instead of creating a second document; unique,
        // because every row already owns a distinct key.
        leader.idempotencyKey,
        creds,
      );

      await this.recordOutcome(batch.id, group, response, handler, input.target, input.onDuplicate);
      // Whatever the outcome was, these rows are no longer outstanding for THIS pass. The
      // one exception — a row left pending because another process held its idempotency key
      // — is genuinely not this pass's to finish either.
      for (const row of pending) pendingKeys.delete(row.rowNo);
    }

    return this.closeBatch(batch.id, spec);
  }

  /* --------------------------------- history -------------------------------- */

  async listBatches(limit: number, cursor?: string): Promise<CursorPage<unknown>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      // NEWEST FIRST, and the cursor predicate has to agree with that.
      //
      // The first version ordered by `started_at DESC` while comparing the cursor with `>`
      // on `created_at` — page one was right and page two was nonsense, which is the way
      // this bug always presents. A descending keyset walks DOWN, so the comparison is `<`
      // on the same column the ORDER BY uses, with the id breaking ties.
      const rows = await tx
        .select()
        .from(dataImportBatch)
        .where(
          keyset
            ? or(
                lt(dataImportBatch.createdAt, new Date(keyset.createdAt)),
                and(
                  eq(dataImportBatch.createdAt, new Date(keyset.createdAt)),
                  lt(dataImportBatch.id, keyset.id),
                ),
              )
            : undefined,
        )
        .orderBy(desc(dataImportBatch.createdAt), desc(dataImportBatch.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((b) => {
          // `accepted_count` is the original accepted population. Every terminal attempt
          // moves a row to imported or contributes to failed_count; the remainder is the
          // accepted work a safe resume can still perform, without an extra row-table query
          // for every item on this page.
          const pendingAccepted = Math.max(
            0,
            b.acceptedCount - b.importedCount - b.failedCount,
          );
          return {
            id: b.id,
            sourceKind: b.sourceKind,
            filename: b.filename,
            fileKind: b.fileKind,
            sheetName: b.sheetName,
            target: b.target,
            status: b.status,
            resumable: canResumeImportBatch(b.status, pendingAccepted),
            rowCount: b.rowCount,
            acceptedCount: b.acceptedCount,
            rejectedCount: b.rejectedCount,
            importedCount: b.importedCount,
            failedCount: b.failedCount,
            startedAt: b.startedAt.toISOString(),
            finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
          };
        }),
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      };
    });
  }

  async batchDetail(id: string): Promise<unknown> {
    return withTenant(async (tx) => {
      const batch = (
        await tx.select().from(dataImportBatch).where(eq(dataImportBatch.id, id)).limit(1)
      )[0];
      if (!batch) throw Errors.notFound(`import batch ${id}`);
      const rows = await tx
        .select()
        .from(dataImportRow)
        .where(eq(dataImportRow.batchId, id))
        .orderBy(asc(dataImportRow.rowNo));
      const summary = summarise(rows.map((r) => r.status));
      return {
        id: batch.id,
        source: {
          kind: batch.sourceKind,
          filename: batch.filename,
          fileKind: batch.fileKind,
          byteSize: batch.byteSize,
        },
        sheetName: batch.sheetName,
        target: batch.target,
        mapping: batch.mapping,
        onDuplicate: batch.onDuplicate,
        status: batch.status,
        rowCount: batch.rowCount,
        acceptedCount: batch.acceptedCount,
        rejectedCount: batch.rejectedCount,
        importedCount: batch.importedCount,
        failedCount: batch.failedCount,
        startedAt: batch.startedAt.toISOString(),
        finishedAt: batch.finishedAt ? batch.finishedAt.toISOString() : null,
        summary,
        // Do not make a blanket promise from the word `partial`. Only an accepted row is
        // safe and meaningful to resume; rejected/failed/duplicate-held rows need a changed
        // file, mapping, authority or duplicate decision.
        resumable: canResumeImportBatch(batch.status, summary.stillPending),
        rows: rows.map((r) => ({
          rowNo: r.rowNo,
          status: r.status,
          groupKey: r.groupKey,
          issues: r.issues,
          values: r.mapped,
          raw: r.raw,
          resultId: r.resultId,
          resultRef: r.resultRef,
          importedAt: r.importedAt ? r.importedAt.toISOString() : null,
          failureCode: r.failureCode,
          failureMessage: r.failureMessage,
        })),
      };
    });
  }

  /* --------------------------------- internals ------------------------------ */

  private spec(key: ImportTargetKey): ImportTargetSpec {
    const spec = importTarget(key);
    if (!spec) {
      throw Errors.validation([
        { field: "target", message: `"${key}" is not something this build imports` },
      ]);
    }
    return spec;
  }

  /**
   * WHAT THE UI IS OBLIGED TO SAY OUT LOUD.
   *
   * Every response carries the provenance of the data in it. An uploaded file is not a
   * connected system and neither is demo data, and a screen that renders all three
   * identically is teaching somebody to trust a number for a reason that is not true. The
   * badge in the web module reads this; it does not decide it.
   */
  private sourceOf(book: DecodedWorkbook, filename: string): unknown {
    return {
      kind: "uploaded_file",
      filename,
      fileKind: book.fileKind,
      byteSize: book.byteSize,
      label: `Uploaded file · ${filename}`,
    };
  }

  /**
   * The batch's identity: the bytes, the sheet, the target, the mapping and what the
   * operator said to do about duplicates.
   *
   * Including the mapping is what allows a corrected mapping to be a NEW import of the same
   * file rather than a resume of the wrong one — which was the first version's bug, and it
   * silently refused to re-import a file the operator had just fixed. The duplicate
   * disposition is in for the same reason: coming back after reading the explanation and
   * saying "these really are two different companies" is a new decision about the same file
   * and has to be able to run, with the first batch left standing as the record that it was
   * held once.
   *
   * The parts are joined with a separator that cannot occur inside a hex digest, a sheet
   * name or a target key, so no two different imports can hash to the same string by
   * concatenation.
   */
  private contentHash(
    book: DecodedWorkbook,
    input: {
      sheet: string;
      target: string;
      mapping: ColumnMapping;
      onDuplicate: "skip" | "import_anyway";
    },
  ): string {
    const canonicalMapping = Object.keys(input.mapping)
      .sort()
      .map((k) => `${k}=${input.mapping[k]}`)
      .join("|");
    return createHash("sha256")
      .update(
        [
          book.bytesHash,
          input.sheet,
          input.target,
          canonicalMapping,
          input.onDuplicate,
        ].join("\n--\n"),
      )
      .digest("hex");
  }

  /** Read the file, apply the mapping, validate every row, resolve every reference, group. */
  private async assess(
    input: {
      fileBase64: string;
      filename: string;
      sheet: string;
      target: ImportTargetKey;
      mapping: ColumnMapping;
    },
    creds: ForwardedCredentials,
  ): Promise<Assessment> {
    const spec = this.spec(input.target);
    const handler = targetHandler(input.target);
    const book = decodeWorkbook(input.fileBase64);
    const sheet = sheetByName(book, input.sheet);
    const header = inferSheetHeaders(sheet.matrix);
    const rows = sheetRows(sheet.matrix, header);

    const missingRequired = unmappedRequiredFields(spec, input.mapping);
    const refs = await this.referenceBook(handler.lookups, creds);

    const assessed: AssessedRow[] = rows.map((row: SheetRow) => {
      const mapped = applyColumnMapping(row, input.mapping);
      const result = validateImportRow(spec, mapped);
      const issues: RowIssue[] = [...result.issues];
      // Reference checks only run on a row whose own fields read cleanly. Telling somebody
      // that "" is not in the part master, when the real problem is that the item column was
      // never mapped, is a second wrong answer stacked on the first.
      if (result.ok) issues.push(...handler.referenceIssues(result.values, refs));
      return {
        rowNo: row.rowNo,
        raw: displayCells(row),
        values: result.values,
        issues,
        accepted: issues.every(isAdvisory),
        groupKey: null,
      };
    });

    const groups = groupImportRows(
      spec,
      assessed.filter((r) => r.accepted).map((r) => ({ rowNo: r.rowNo, values: r.values })),
    );

    // A group whose rows disagree about the document takes all of its rows down with it —
    // and every one of them is told why, because "row 14 failed" on a three-line order the
    // operator never thought of as a group is not an explanation.
    const byRowNo = new Map(assessed.map((r) => [r.rowNo, r]));
    const assessedGroups: AssessedGroup[] = groups.map((group) => {
      const accepted = group.conflicts.length === 0;
      for (const row of group.rows) {
        const target = byRowNo.get(row.rowNo);
        if (!target) continue;
        target.groupKey = group.key;
        if (!accepted) {
          target.issues = [...target.issues, ...group.conflicts];
          target.accepted = false;
        }
      }
      return { group, accepted };
    });

    return {
      book,
      source: this.sourceOf(book, input.filename),
      spec,
      rows: assessed,
      groups: assessedGroups,
      refs,
      missingRequired,
      unmappedColumns: unmappedColumns(header.headers, input.mapping),
    };
  }

  /**
   * The code-to-id maps this target needs, read through the caller's own credentials.
   *
   * Read over the API rather than out of the tables directly, for the same reason the writes
   * are: the module boundary is enforced, and a lookup that ignored the caller's read
   * permission would let an import reveal, by which codes resolve, the contents of a master
   * they may not open.
   */
  private async referenceBook(
    kinds: readonly LookupKind[],
    creds: ForwardedCredentials,
  ): Promise<ReferenceBook> {
    const empty = new Map<string, ReferenceEntry>();
    const book: Record<LookupKind, ReadonlyMap<string, ReferenceEntry>> = {
      customers: empty,
      items: empty,
      warehouses: empty,
    };
    for (const kind of kinds) {
      const source = LOOKUP_SOURCES[kind];
      const rows = await this.domain.list<Record<string, unknown>>(source.path, creds);
      const map = new Map<string, ReferenceEntry>();
      for (const row of rows) {
        const code = row[source.codeField];
        const id = row.id;
        if (typeof code !== "string" || typeof id !== "string") continue;
        map.set(code.trim().toLowerCase(), {
          id,
          code,
          name: typeof row[source.nameField] === "string" ? (row[source.nameField] as string) : "",
        });
      }
      book[kind] = map;
    }
    return book;
  }

  /**
   * Find the batch for this content, or create it with every row written down first.
   *
   * The rows go in BEFORE any domain call, all of them, accepted and rejected alike. That
   * ordering is the whole resumability story: if the process dies on row 200, the record of
   * rows 201 to 400 already exists and a resume knows exactly what is left. Writing rows as
   * they succeed would leave the survivors indistinguishable from the never-attempted.
   */
  private async openBatch(
    contentHash: string,
    input: {
      filename: string;
      sheet: string;
      target: ImportTargetKey;
      mapping: ColumnMapping;
      onDuplicate: "skip" | "import_anyway";
    },
    assessment: Assessment,
  ): Promise<{ id: string; status: string }> {
    const { tenantId, actorId } = currentTenant();

    const existing = await withTenant(async (tx) =>
      (
        await tx
          .select({ id: dataImportBatch.id, status: dataImportBatch.status })
          .from(dataImportBatch)
          .where(eq(dataImportBatch.contentHash, contentHash))
          .limit(1)
      )[0],
    );
    if (existing) return existing;

    const batchId = newId();
    const accepted = assessment.rows.filter((r) => r.accepted).length;

    try {
      await withTenant(async (tx) => {
        await tx.insert(dataImportBatch).values({
          id: batchId,
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          sourceKind: "uploaded_file",
          filename: input.filename,
          fileKind: assessment.book.fileKind,
          byteSize: assessment.book.byteSize,
          contentHash,
          sheetName: input.sheet,
          target: input.target,
          mapping: input.mapping,
          rowCount: assessment.rows.length,
          acceptedCount: accepted,
          rejectedCount: assessment.rows.length - accepted,
          onDuplicate: input.onDuplicate,
          status: "running",
        });
        if (assessment.rows.length > 0) {
          await tx.insert(dataImportRow).values(
            assessment.rows.map((row) => ({
              id: newId(),
              tenantId,
              createdBy: actorId,
              updatedBy: actorId,
              batchId,
              rowNo: row.rowNo,
              groupKey: row.groupKey,
              raw: row.raw,
              mapped: row.values,
              issues: row.issues,
              status: row.accepted ? "accepted" : "rejected",
              idempotencyKey: `dimp:${batchId}:${row.rowNo}`,
              ...(row.accepted
                ? {}
                : { failureMessage: row.issues.map((i) => i.message).join(" ") || null }),
            })),
          );
        }
      });
    } catch (error) {
      // Two commits of the same file raced. The unique index on (tenant_id, content_hash)
      // decided which one owns the batch; the loser joins it rather than starting a second.
      const winner = await withTenant(async (tx) =>
        (
          await tx
            .select({ id: dataImportBatch.id, status: dataImportBatch.status })
            .from(dataImportBatch)
            .where(eq(dataImportBatch.contentHash, contentHash))
            .limit(1)
        )[0],
      );
      if (winner) return winner;
      throw error;
    }

    return { id: batchId, status: "running" };
  }

  /**
   * Decide, under a lock on the batch, whether this call may run its row loop.
   *
   * `running` always continues, including an all-rejected file whose only remaining work is
   * to calculate and persist its final batch status. A terminal batch is reopened only when
   * at least one row is still `accepted`. That is the crash/idempotency-in-progress state:
   * it has a deterministic row key and is safe to call again. A batch containing only
   * imported, rejected, failed or duplicate-held rows is history, not hidden retry work.
   */
  private async prepareBatchForCommit(batchId: string): Promise<boolean> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const batch = (
        await tx
          .select({ status: dataImportBatch.status })
          .from(dataImportBatch)
          .where(eq(dataImportBatch.id, batchId))
          .for("update")
          .limit(1)
      )[0];
      if (!batch) throw Errors.notFound(`import batch ${batchId}`);
      if (batch.status === "running") return true;

      const pending = (
        await tx
          .select({ id: dataImportRow.id })
          .from(dataImportRow)
          .where(and(eq(dataImportRow.batchId, batchId), eq(dataImportRow.status, "accepted")))
          .limit(1)
      )[0];
      if (!canResumeImportBatch(batch.status, pending ? 1 : 0)) return false;

      await tx
        .update(dataImportBatch)
        .set({
          status: "running",
          finishedAt: null,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(dataImportBatch.id, batchId));
      return true;
    });
  }

  /**
   * Row number -> its idempotency key, for every row of this batch still outstanding.
   *
   * On a first run that is every accepted row; on a resume it is what the previous attempt
   * did not finish, which is the whole reason a part-completed import can be continued
   * rather than repeated.
   */
  private async pendingRows(batchId: string): Promise<Map<number, string>> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({
          rowNo: dataImportRow.rowNo,
          idempotencyKey: dataImportRow.idempotencyKey,
        })
        .from(dataImportRow)
        .where(and(eq(dataImportRow.batchId, batchId), eq(dataImportRow.status, "accepted")));
      return new Map(rows.map((r) => [r.rowNo, r.idempotencyKey]));
    });
  }

  /**
   * What the domain endpoint said, written against every row of the group.
   *
   * Four outcomes, and they are deliberately not collapsed:
   *   2xx                     imported, with the document reference a person would quote.
   *   409 duplicate_suspected the master already holds something very like this. Under the
   *                           default `skip` the row is left alone and marked, because an
   *                           import must never be a way to walk past a warning a human
   *                           would have had to answer.
   *   409 in progress         somebody else is committing this exact row. Left `accepted`
   *                           so a later resume finishes it — marking it failed would make
   *                           the resume skip real work.
   *   anything else           failed, with the code and message the endpoint gave, kept
   *                           verbatim so the reason survives to the history screen.
   */
  private async recordOutcome(
    batchId: string,
    group: AssessedGroup,
    response: { status: number; body: unknown },
    handler: ReturnType<typeof targetHandler>,
    target: ImportTargetKey,
    onDuplicate: "skip" | "import_anyway",
  ): Promise<void> {
    const { actorId } = currentTenant();
    const rowNos = group.group.rows.map((r) => r.rowNo);
    const envelope = response.body as
      | {
          error?: { code?: string; message?: string; details?: unknown };
          outcome?: string;
          explanation?: string;
        }
      | null;

    let patch: Record<string, unknown>;
    if (response.status >= 200 && response.status < 300) {
      const described = handler.describe(response.body);
      patch = {
        status: "imported",
        importedAt: new Date(),
        resultId: described.id ?? null,
        resultRef:
          described.ref ??
          (target === "stock_opening" ? stockReceiptRef(group.group.header) : null),
        failureCode: null,
        failureMessage: null,
      };
    } else if (response.status === 409 && envelope?.outcome === "duplicate_suspected") {
      patch = {
        status: onDuplicate === "skip" ? "duplicate_suspected" : "failed",
        failureCode: "DUPLICATE_SUSPECTED",
        failureMessage:
          envelope.explanation ??
          "The master already holds a very similar record. Nothing was created. Re-run with " +
            "“import anyway” if these are genuinely different.",
      };
    } else if (response.status === 409 && envelope?.error?.code === "IDEMPOTENCY_IN_PROGRESS") {
      // Left pending on purpose — see the doc comment.
      return;
    } else {
      // KEEP THE FIELD-LEVEL DETAIL, because without it this row is unfixable.
      //
      // The canonical error envelope carries `details: [{field, message}]`, and the top-level
      // `message` for a validation failure is the generic "Request failed validation." On its
      // own that tells an operator staring at a rejected row precisely nothing — measured: a
      // row with a malformed GSTIN reported "Request failed validation." and named neither the
      // column nor the value, on a screen whose entire job is to say which cell to correct.
      const base = envelope?.error?.message ?? `The endpoint answered ${response.status}.`;
      patch = {
        status: "failed",
        failureCode: envelope?.error?.code ?? `HTTP_${response.status}`,
        failureMessage: formatImportFailureMessage(base, envelope?.error?.details),
      };
    }

    // One statement for the whole group. Every row of a group shares its outcome by
    // definition — the document either exists or it does not — so updating them one at a
    // time buys nothing and leaves a window where half a group carries the answer.
    await withTenant(async (tx) => {
      await tx
        .update(dataImportRow)
        .set({ ...patch, updatedAt: new Date(), updatedBy: actorId })
        .where(
          and(eq(dataImportRow.batchId, batchId), inArray(dataImportRow.rowNo, [...rowNos])),
        );
    });
  }

  /** Count what happened, close the batch, and answer with the whole of it. */
  private async closeBatch(batchId: string, spec: ImportTargetSpec): Promise<unknown> {
    const { actorId } = currentTenant();
    const counts = await withTenant(async (tx) => {
      const rows = await tx
        .select({ status: dataImportRow.status })
        .from(dataImportRow)
        .where(eq(dataImportRow.batchId, batchId));
      return summarise(rows.map((r) => r.status));
    });

    // `partial` is a first-class outcome rather than a rounded-up success. An import that
    // created 340 of 400 rows is not "done", and the screen that says so is the one that
    // stops somebody re-uploading the whole file.
    const unfinished =
      counts.failed + counts.rejected + counts.duplicatesHeld + counts.stillPending;
    const status =
      counts.imported === 0 && unfinished > 0
        ? "failed"
        : unfinished > 0
          ? "partial"
          : "completed";

    await withTenant(async (tx) => {
      await tx
        .update(dataImportBatch)
        .set({
          status,
          importedCount: counts.imported,
          failedCount: counts.failed + counts.duplicatesHeld,
          finishedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(dataImportBatch.id, batchId));
    });

    // The summary rides on every batch answer (see `batchDetail`), so the wizard's final
    // screen and the history screen cannot disagree about what happened.
    const detail = (await this.batchDetail(batchId)) as Record<string, unknown>;
    return { ...detail, creates: spec.creates };
  }
}

/**
 * The one place row statuses are counted.
 *
 * `duplicatesHeld` is counted apart from `failed` deliberately. A held duplicate is not a
 * fault — it is the duplicate brain doing its job and a person being asked a question — and
 * folding the two together teaches an operator to ignore both.
 */
function summarise(statuses: readonly string[]): {
  imported: number;
  failed: number;
  rejected: number;
  duplicatesHeld: number;
  stillPending: number;
} {
  const of = (status: string): number => statuses.filter((s) => s === status).length;
  return {
    imported: of("imported"),
    failed: of("failed"),
    rejected: of("rejected"),
    duplicatesHeld: of("duplicate_suspected"),
    stillPending: of("accepted"),
  };
}

interface AssessedRow {
  rowNo: number;
  raw: Readonly<Record<string, string>>;
  values: Readonly<Record<string, unknown>>;
  issues: RowIssue[];
  accepted: boolean;
  groupKey: string | null;
}

interface AssessedGroup {
  group: RowGroup;
  accepted: boolean;
}

interface Assessment {
  book: DecodedWorkbook;
  source: unknown;
  spec: ImportTargetSpec;
  rows: AssessedRow[];
  groups: AssessedGroup[];
  refs: ReferenceBook;
  missingRequired: readonly string[];
  unmappedColumns: readonly string[];
}

/** Kept for the controller's error path: an unreadable target is a 422, never a 500. */
export function assertKnownTarget(key: string): asserts key is ImportTargetKey {
  if (!importTarget(key)) {
    throw new AppError(
      "IMPORT_TARGET_UNKNOWN",
      422,
      `"${key}" is not something this build imports.`,
    );
  }
}

/**
 * The public lifecycle promise behind `resumable`.
 *
 * A response status alone is not enough: `partial` can mean an invalid row, a held
 * duplicate, a domain refusal, or a genuinely interrupted accepted row. Only the last one
 * is replayable without changing the operator's input or decision.
 */
export function canResumeImportBatch(status: string, acceptedPending: number): boolean {
  return (
    acceptedPending > 0 &&
    (status === "running" || status === "partial" || status === "failed")
  );
}

/**
 * Add canonical field-level validation detail to the row's durable failure reason.
 *
 * `response.body` crossed an HTTP boundary and is therefore untrusted at runtime even
 * though this application's canonical envelope promises `{field, message}` objects. A
 * malformed/null element must be ignored rather than throwing after the domain request has
 * already completed and leaving the import row falsely pending.
 */
export function formatImportFailureMessage(base: string, details: unknown): string {
  if (!Array.isArray(details)) return base;
  const fields = details
    .map((detail) => {
      if (typeof detail !== "object" || detail === null) return null;
      const rec = detail as { field?: unknown; message?: unknown };
      const field = typeof rec.field === "string" ? rec.field : null;
      const message = typeof rec.message === "string" ? rec.message : null;
      return field && message ? `${field}: ${message}` : (message ?? field);
    })
    .filter((value): value is string => Boolean(value));
  return fields.length > 0 ? `${base} ${fields.join("; ")}` : base;
}
