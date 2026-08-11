/**
 * Data import's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * The types are read off the service, not guessed. One thing worth knowing before reading
 * them: THE FIELD LIST IS NOT DEFINED HERE. `GET /dataimport/targets` serves the same target
 * specification the server validates against, so the mapping controls on the wizard and the
 * rules that accept or refuse a row cannot drift apart. A second hand-written copy of "what
 * a customer needs" in this file is precisely how a file comes to validate in the browser
 * and fail on commit.
 */

/* ------------------------------- the targets ----------------------------- */

export type ImportFieldType = "text" | "number" | "integer" | "boolean" | "date" | "enum";

export interface ImportFieldSpec {
  field: string;
  label: string;
  type: ImportFieldType;
  required: boolean;
  enumValues?: readonly string[];
  aliases?: readonly string[];
  help?: string;
  max?: number;
  min?: number;
}

export interface ImportTargetSpec {
  key: string;
  label: string;
  /** One line: what one row becomes. */
  creates: string;
  description: string;
  /** Present when rows are folded into documents — sales orders, and nothing else today. */
  groupBy?: readonly string[];
  fields: readonly ImportFieldSpec[];
}

export interface TargetsResponse {
  targets: readonly ImportTargetSpec[];
}

/* -------------------------------- provenance ----------------------------- */

/**
 * Where the data in a response came from. Every import answer carries it, and the wizard
 * renders it as a badge — see `source-badge.tsx` for why that is not decoration.
 */
export interface ImportSource {
  kind: "uploaded_file";
  filename: string;
  fileKind: "csv" | "xlsx" | "xls";
  byteSize: number;
  label?: string;
}

/* --------------------------------- inspect ------------------------------- */

export interface SheetSummary {
  name: string;
  headers: readonly string[];
  rowCount: number;
}

export interface SampleRow {
  /** The 1-based row number as it appears in Excel. */
  rowNo: number;
  cells: Readonly<Record<string, string>>;
}

export interface InspectResponse {
  source: ImportSource;
  sheets: readonly SheetSummary[];
  selectedSheet: string;
  headerRowNo: number | null;
  headers: readonly string[];
  rowCount: number;
  sampleRows: readonly SampleRow[];
  target?: string;
  suggestedMapping?: Readonly<Record<string, string>>;
  unmappedColumns?: readonly string[];
  missingRequiredFields?: readonly string[];
}

/* -------------------------------- validate ------------------------------- */

export type RowIssueKind =
  | "missing"
  | "format"
  | "range"
  | "not_allowed"
  | "reference"
  | "ambiguous";

export interface RowIssue {
  field: string;
  label: string;
  kind: RowIssueKind;
  message: string;
  value: string;
}

export interface ValidatedRow {
  rowNo: number;
  status: "accepted" | "rejected";
  groupKey: string | null;
  issues: readonly RowIssue[];
  values: Readonly<Record<string, unknown>>;
}

export interface ValidateResponse {
  source: ImportSource;
  target: string;
  sheet: string;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  /** How many DOCUMENTS the accepted rows become — differs from the row count when grouped. */
  documentCount: number;
  unmappedColumns: readonly string[];
  missingRequiredFields: readonly string[];
  rows: readonly ValidatedRow[];
}

/* --------------------------------- commit -------------------------------- */

export type ImportRowStatus =
  | "accepted"
  | "rejected"
  | "imported"
  | "failed"
  | "duplicate_suspected"
  | "skipped";

export interface BatchRow {
  rowNo: number;
  status: ImportRowStatus;
  groupKey: string | null;
  issues: readonly RowIssue[] | null;
  values: Readonly<Record<string, unknown>> | null;
  raw: Readonly<Record<string, string>> | null;
  resultId: string | null;
  /** The document number a person would quote: SO-2627-00005, CUST-BAC. */
  resultRef: string | null;
  importedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface BatchSummary {
  imported: number;
  failed: number;
  rejected: number;
  /** Held for a person to decide — the duplicate brain refused to guess. */
  duplicatesHeld: number;
  stillPending: number;
}

export interface BatchDetail {
  id: string;
  source: Omit<ImportSource, "label">;
  sheetName: string;
  target: string;
  mapping: Readonly<Record<string, string>>;
  onDuplicate: "skip" | "import_anyway";
  status: "running" | "completed" | "partial" | "failed";
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  summary: BatchSummary;
  /** True only when accepted rows remain and re-posting this exact commit can continue them. */
  resumable: boolean;
  rows: readonly BatchRow[];
  /** Only on the answer to a commit: what one row of this target becomes. */
  creates?: string;
}

export interface BatchListRow {
  id: string;
  sourceKind: string;
  filename: string;
  fileKind: string;
  sheetName: string;
  target: string;
  status: BatchDetail["status"];
  resumable: boolean;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface CursorPage<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export const dataImportApi = {
  targetsPath: "/dataimport/targets",
  inspectPath: "/dataimport/inspect",
  validatePath: "/dataimport/validate",
  commitPath: "/dataimport/commit",
  batchesPath: "/dataimport/batches",
  batchPath: (id: string): string => `/dataimport/batches/${id}`,
} as const;

/**
 * The upload ceiling, mirrored from the API so the browser can refuse a file BEFORE reading
 * 8 MB into memory and posting it. The server enforces the real limit; this only makes the
 * refusal instant and the message specific.
 */
export const MAX_IMPORT_BYTES = 64 * 1024;

/** What the file picker offers. Everything SheetJS reads, and nothing it does not. */
export const ACCEPTED_FILE_TYPES = ".csv,.xlsx,.xls,text/csv";

/** How a row outcome is coloured. Kept here so the wizard and the history agree. */
export function rowTone(status: ImportRowStatus): "ok" | "warn" | "bad" | "grey" {
  switch (status) {
    case "imported":
      return "ok";
    case "duplicate_suspected":
      return "warn";
    case "failed":
    case "rejected":
      return "bad";
    default:
      return "grey";
  }
}

export function rowStatusLabel(status: ImportRowStatus): string {
  switch (status) {
    case "imported":
      return "Imported";
    case "duplicate_suspected":
      return "Held — possible duplicate";
    case "failed":
      return "Refused by the system";
    case "rejected":
      return "Not imported";
    case "skipped":
      return "Skipped";
    default:
      return "Ready";
  }
}

/**
 * What a problem with a row is, in one word.
 *
 * `reference` reads as "not found" rather than "invalid" on purpose: the value is usually
 * spelled perfectly and simply names something that has not been created yet, and calling
 * that "invalid" sends the operator to check the spelling of a correct cell.
 */
export function issueKindLabel(kind: RowIssueKind): string {
  switch (kind) {
    case "missing":
      return "Missing";
    case "format":
      return "Cannot read";
    case "range":
      return "Out of range";
    case "not_allowed":
      return "Not allowed";
    case "reference":
      return "Not found";
    case "ambiguous":
      return "Check this";
  }
}
