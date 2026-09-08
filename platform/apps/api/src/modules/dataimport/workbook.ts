import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { AppError, Errors, type SheetCell, type SheetMatrix } from "@ind-core/platform";

/**
 * THE ONLY PLACE THAT KNOWS WHAT AN .XLSX IS.
 *
 * One dependency covers every format the customer named: SheetJS reads .xlsx, the older
 * .xls, and .csv, and hands all three back as the same grid of cells. Everything downstream
 * — header inference, mapping, validation, grouping — is in `@ind-core/platform` and has no
 * idea a spreadsheet library exists. That boundary is why the behaviour a factory will argue
 * with is unit-tested and this file is thirty lines of decoding.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FILE ARRIVES AS BASE64 IN A JSON BODY, AND WHAT THAT COSTS
 * ---------------------------------------------------------------------------
 * The alternative is multipart/form-data, which means adding multer, a second body-parsing
 * path, and a route that the existing global JSON pipeline does not touch. Every one of
 * those is a place where the tenant middleware, the permission guard and the error envelope
 * have to be re-verified rather than inherited — and an upload endpoint that quietly skips
 * the auth pipeline is exactly the kind of thing nobody notices until it matters. A base64
 * string in an ordinary JSON body is handled by the pipeline that already exists, and this
 * endpoint is guarded, tenant-fenced and error-enveloped by construction.
 *
 * THE COST IS A HARD SIZE CEILING, AND IT IS SMALL. Express's JSON body parser defaults to
 * 100 KB and nothing in this repository raises it (`configureXelorApp` sets only the global
 * prefix and the error filter). Base64 inflates by 4/3, so the practical limit is around
 * 70 KB of file — roughly 800 to 1,200 rows of a typical master, which covers the customer,
 * vendor and part lists this feature exists for and does NOT cover a year of transactions.
 * Verified rather than assumed: a 300 KB body is rejected by the parser before any handler
 * runs, a 90 KB one reaches the route.
 *
 * {@link MAX_FILE_BYTES} sits deliberately below that line so an oversized file gets a
 * sentence explaining the limit instead of the parser's opaque failure. RAISING IT IS A
 * ONE-LINE CHANGE IN `apps/api/src/bootstrap.ts` (`app.useBodyParser("json", { limit }))`,
 * plus this constant — but the right fix past a few megabytes is a presigned S3 upload with
 * the parse moved to a worker, not a bigger inline body, and it belongs behind the same
 * inspect/validate/commit contract this module already exposes.
 *
 * A NOTE ON THE DEPENDENCY. The npm `xlsx` package stops at vulnerable 0.18.5. SheetJS CE
 * 0.20.3 is therefore pinned to SheetJS's official distribution tarball instead; it contains
 * the prototype-pollution and ReDoS fixes that npm audit cannot find on the registry. The
 * controls here remain defence in depth: uploads require a privileged tenant user, bytes and
 * expanded cells are capped before they can monopolise the process, formulas are not read,
 * and no parsed value is treated as code. A future unauthenticated upload path must still
 * move parsing into an isolated worker.
 */

export type WorkbookFileKind = "csv" | "xlsx" | "xls";

export interface DecodedSheet {
  name: string;
  matrix: SheetMatrix;
}

export interface DecodedWorkbook {
  fileKind: WorkbookFileKind;
  sheets: readonly DecodedSheet[];
  byteSize: number;
  /** sha256 of the raw bytes. Half of a batch's identity; the mapping is the other half. */
  bytesHash: string;
}

/**
 * 64 KiB, chosen against the 100 KB body limit rather than against what feels generous:
 * 64 KiB of file is 87 KB of base64, which leaves room for the filename, the sheet name and
 * a full column mapping in the same body without touching the parser's ceiling.
 */
export const MAX_FILE_BYTES = 64 * 1024;

/**
 * A compressed 64 KiB workbook can decompress into millions of cells. The cap is on what
 * comes OUT of the parser, because a limit on what goes in does not bound a zip.
 */
const MAX_CELLS = 200_000;
const MAX_ROWS_PER_SHEET = 20_000;

/**
 * Is this a real workbook, or text?
 *
 * Decided from the bytes, not the extension. `PK` is a zip and therefore .xlsx; `D0 CF 11 E0`
 * is the OLE compound-document header of the old .xls. Anything else is treated as text —
 * including a .csv somebody saved with a .xls extension because that is what the accounts
 * package offered, which is a file this has to read rather than argue with.
 */
function looksBinary(bytes: Buffer): boolean {
  if (bytes.length < 4) return false;
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole =
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

/** UTF-8 text with the byte-order mark removed. */
function utf8(bytes: Buffer): string {
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Is the CSV fallback about to be handed something that is not text at all?
 *
 * `looksBinary` only recognises the two workbook containers by their magic bytes, so
 * ANYTHING else — a PDF, a JPEG, a corrupt download, a file renamed to .xlsx by somebody
 * who meant well — falls through to the CSV branch. The CSV parser does not object: it
 * splits the bytes on commas and newlines and the first line becomes a column heading.
 * Measured: 200 random bytes returned HTTP 200 with a header row of mojibake, and the
 * import wizard then invited the operator to map that mojibake onto "Customer name".
 *
 * A refusal has to be the answer, because the alternative is a mapping screen offering
 * nonsense as a choice — and somewhere past that is an import that half-succeeds.
 *
 * The test is run on the DECODED TEXT, not the raw bytes, and that distinction is the whole
 * reason this is safe in an India-first product: Devanagari, Tamil and the rupee sign are
 * all perfectly ordinary multi-byte UTF-8, so a byte-level "is there a high bit" test would
 * reject exactly the customers this is built for. Valid UTF-8 decodes without producing
 * U+FFFD; bytes that are not text produce it in quantity. Control characters are counted
 * with it — tab, newline and carriage return excepted, since a CSV is made of those.
 */
function looksLikeText(bytes: Buffer): boolean {
  const sample = utf8(bytes.subarray(0, 4096));
  if (sample.length === 0) return false;
  let bad = 0;
  for (const ch of sample) {
    const c = ch.codePointAt(0) ?? 0;
    const isControl = c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d;
    if (isControl || c === 0xfffd || c === 0x00) bad++;
  }
  // A tenth is generous. A real CSV scores zero; the random-bytes case scored above half.
  return bad / sample.length < 0.1;
}

/** What was actually read, from the bytes — never from what the extension claimed. */
function fileKindOf(bytes: Buffer): WorkbookFileKind {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";
  if (looksBinary(bytes)) return "xls";
  return "csv";
}

/** Base64 in, bytes out, with the two failures a user can actually cause named separately. */
function decodeBase64(fileBase64: string): Buffer {
  // Data-URL prefixes arrive whenever a browser used FileReader.readAsDataURL. Stripping it
  // is not leniency for its own sake: the alternative is a "file is not a spreadsheet" error
  // for a file that is perfectly fine.
  const payload = fileBase64.includes(",")
    ? fileBase64.slice(fileBase64.indexOf(",") + 1)
    : fileBase64;
  const cleaned = payload.replace(/\s/g, "");
  if (cleaned === "") {
    throw Errors.validation([{ field: "fileBase64", message: "the file is empty" }]);
  }
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length === 0) {
    throw Errors.validation([{ field: "fileBase64", message: "not valid base64" }]);
  }
  if (bytes.length > MAX_FILE_BYTES) {
    throw new AppError(
      "IMPORT_FILE_TOO_LARGE",
      413,
      `This file is ${Math.round(bytes.length / 1024)} KB. The upload limit is ` +
        `${MAX_FILE_BYTES / 1024} KB per import in this build — split the sheet and import ` +
        `it in parts, or ask for the server upload limit to be raised.`,
    );
  }
  return bytes;
}

/**
 * Every sheet in the workbook, as a grid.
 *
 * `cellDates` is on so a real date cell arrives as a Date rather than as the serial number
 * 46223, and `defval: null` so a blank cell holds its position — without it a row with a gap
 * shifts left and every column after the gap silently belongs to the wrong field.
 */
export function decodeWorkbook(fileBase64: string): DecodedWorkbook {
  const bytes = decodeBase64(fileBase64);

  // Refuse before the CSV parser gets a chance to make sense of nonsense. See looksLikeText.
  if (!looksBinary(bytes) && !looksLikeText(bytes)) {
    throw new AppError(
      "IMPORT_FILE_UNREADABLE",
      422,
      "This file is not a spreadsheet. It is not an .xlsx or .xls workbook, and its " +
        "contents are not text either, so there are no rows to read. If it was exported " +
        "from another system, try exporting it again as CSV or Excel.",
    );
  }

  let book: XLSX.WorkBook;
  try {
    book = looksBinary(bytes)
      ? XLSX.read(bytes, { type: "buffer", cellDates: true, cellFormula: false })
      : // A text file is decoded as UTF-8 BY US rather than left to the parser's codepage
        // guess. Without this a rupee sign arrives as "â¹" and a Devanagari or Tamil column
        // heading arrives as mojibake — which in an India-first product is not an edge case,
        // it is Tuesday. The BOM Excel writes on "CSV UTF-8" export is stripped for the same
        // reason: left in place it becomes part of the first column's name, and that column
        // then matches no field.
        //
        // `raw: true` STOPS THE CSV PARSER GUESSING TYPES, and that is the important flag.
        // Left off, SheetJS reads "03/04/2026" as 4 March — month-first, American — and by
        // the time the value reaches the validator it is a Date with no trace of the text it
        // came from, so the day-first rule this product is sold under cannot be applied and
        // the ambiguity cannot even be reported. Every CSV cell therefore arrives as the
        // string the file contains, and every interpretation happens in one tested place.
        XLSX.read(utf8(bytes), { type: "string", raw: true, cellFormula: false });
  } catch (error) {
    throw new AppError(
      "IMPORT_FILE_UNREADABLE",
      422,
      `This file could not be read as a spreadsheet. ${
        error instanceof Error ? error.message : "Unknown parse failure."
      }`,
    );
  }

  let cells = 0;
  const sheets: DecodedSheet[] = [];
  for (const name of book.SheetNames) {
    const ws = book.Sheets[name];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<SheetCell[]>(ws, {
      header: 1,
      raw: true,
      blankrows: true,
      defval: null,
    });
    if (matrix.length > MAX_ROWS_PER_SHEET) {
      throw new AppError(
        "IMPORT_FILE_TOO_LARGE",
        413,
        `Sheet "${name}" has ${matrix.length} rows; this build imports at most ` +
          `${MAX_ROWS_PER_SHEET} rows per sheet.`,
      );
    }
    cells += matrix.reduce((n, row) => n + row.length, 0);
    if (cells > MAX_CELLS) {
      throw new AppError(
        "IMPORT_FILE_TOO_LARGE",
        413,
        "This workbook expands to more cells than an inline import can hold. Split it, or " +
          "delete the sheets that are not being imported.",
      );
    }
    sheets.push({ name, matrix });
  }

  if (sheets.length === 0) {
    throw new AppError("IMPORT_FILE_UNREADABLE", 422, "This file contains no sheets.");
  }

  return {
    fileKind: fileKindOf(bytes),
    sheets,
    byteSize: bytes.length,
    bytesHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

/** One named sheet, or a 422 naming the sheets that do exist — never a silent first sheet. */
export function sheetByName(book: DecodedWorkbook, name: string): DecodedSheet {
  const hit = book.sheets.find((s) => s.name === name);
  if (!hit) {
    throw Errors.validation([
      {
        field: "sheet",
        message: `no sheet called "${name}". This file has: ${book.sheets
          .map((s) => s.name)
          .join(", ")}`,
      },
    ]);
  }
  return hit;
}
