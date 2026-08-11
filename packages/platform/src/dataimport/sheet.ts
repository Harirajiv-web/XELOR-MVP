/**
 * A GRID OF CELLS, TURNED INTO ROWS SOMEBODY CAN ARGUE WITH.
 *
 * The workbook decoder (in the API, where the xlsx dependency lives) hands this file the
 * dumbest possible representation: an array of arrays of cell values, exactly as the sheet
 * is laid out. Everything from there — where the header row is, what the columns are
 * called, which row number to quote back at the operator — is decided here, in a pure
 * function with no library underneath it, because these are the decisions that get argued
 * about and they should be testable in isolation.
 *
 * TWO THINGS THIS FILE IS PARANOID ABOUT, BOTH LEARNED FROM REAL SHEETS:
 *
 * 1. THE FIRST ROW IS OFTEN NOT THE HEADER. Real files open with a merged title
 *    ("CUSTOMER MASTER - JULY 2026"), sometimes a blank row, sometimes the company name and
 *    a logo. Taking row 1 on faith produces a mapping screen whose columns are called
 *    "CUSTOMER MASTER - JULY 2026" and "__EMPTY_1", and the operator's only available
 *    conclusion is that the software is broken.
 *
 * 2. THE ROW NUMBER MUST BE THE ONE IN EXCEL. Reporting "row 3 failed" when the operator's
 *    screen shows that record on row 5 is worse than reporting nothing: they will fix the
 *    wrong line and re-upload. Every row therefore carries `rowNo`, the 1-based
 *    spreadsheet row, and every error message quotes it.
 */

/** What a cell can be after decoding. Dates arrive as Date when the workbook typed them. */
export type SheetCell = string | number | boolean | Date | null;

/** A sheet exactly as laid out: `matrix[row][column]`, both 0-based, ragged rows allowed. */
export type SheetMatrix = readonly (readonly SheetCell[])[];

export interface SheetHeader {
  /** 0-based index into the matrix of the row the column names came from. */
  headerRowIndex: number;
  /** Column names, in sheet order. Blank and duplicate headings are made usable, not dropped. */
  headers: readonly string[];
}

export interface SheetRow {
  /** The 1-based row number as displayed in Excel — the number to quote in an error. */
  rowNo: number;
  cells: Readonly<Record<string, SheetCell>>;
}

/** How far down we look for a header row. Beyond this a file is not a table with a title. */
const HEADER_SCAN_ROWS = 20;

function isBlank(cell: SheetCell | undefined): boolean {
  if (cell === null || cell === undefined) return true;
  return typeof cell === "string" && cell.trim() === "";
}

function filled(row: readonly SheetCell[]): number {
  return row.filter((c) => !isBlank(c)).length;
}

/**
 * A DATE CELL IS A CALENDAR DATE, NOT AN INSTANT — READ IT LOCALLY.
 *
 * A spreadsheet library builds "20-Jul-2026" as local midnight. Reading that back through
 * `toISOString()` converts to UTC, and in every timezone ahead of UTC the answer is the
 * PREVIOUS DAY: in Mumbai this reported 2026-07-19, silently, for every date in every
 * imported file. Found by running a real file through the endpoint rather than by reasoning
 * about it, which is the only way this class of bug is ever found.
 *
 * A date-only cell never had a timezone, so the local calendar components are the only
 * reading that does not invent one.
 */
export function isoFromDate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Excel's column letters: 0 -> A, 25 -> Z, 26 -> AA.
 *
 * Used to name a column whose heading is blank. "Column F" is a name the operator can find
 * on their own screen; a generated `__EMPTY_3` is not.
 */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Where the column names are, and what they are.
 *
 * Two signals, in this order, and each one is there because a plausible-looking alternative
 * gets a real file wrong:
 *
 *   WIDTH  — a header covers most of the used columns; a title covers one. So a row is only
 *            a candidate if it fills at least half the widest row. NOT "the widest row",
 *            which was the first attempt and fails on the very common sheet whose header
 *            has one blank heading: the data rows are then wider than the header, and the
 *            first record silently becomes the column names.
 *   TEXT   — among the candidates, the first whose filled cells are ALL text. A row of
 *            numbers is data however wide it is.
 *
 * The chosen row is padded out to the widest row in the file, so a trailing column with no
 * heading still appears (as its column letter) instead of vanishing.
 *
 * An empty sheet yields `headerRowIndex: -1` and no headers, which callers must handle:
 * "this sheet is empty" is a legitimate answer to give an operator, and inventing a header
 * for it would produce a mapping screen for nothing.
 */
export function inferSheetHeaders(matrix: SheetMatrix): SheetHeader {
  const window = matrix.slice(0, HEADER_SCAN_ROWS);
  const widest = window.reduce((max, row) => Math.max(max, filled(row)), 0);
  if (widest === 0) return { headerRowIndex: -1, headers: [] };

  const minWidth = Math.max(1, Math.ceil(widest / 2));
  const candidates = window
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => filled(row) >= minWidth);

  const texty = candidates.find(({ row }) =>
    row.every((c) => isBlank(c) || typeof c === "string"),
  );
  const chosen = texty ?? candidates[0]!;

  const columns = matrix.reduce((max, row) => Math.max(max, row.length), 0);

  // Blank headings become their column letter; repeats get a suffix. Both are kept rather
  // than dropped, because a column that disappears from the mapping screen is a column the
  // operator will assume was imported.
  const seen = new Map<string, number>();
  const headers = Array.from({ length: columns }, (_unused, col) => {
    const cell = chosen.row[col] ?? null;
    const raw = isBlank(cell) ? `Column ${columnLetter(col)}` : String(cell).trim();
    const used = seen.get(raw) ?? 0;
    seen.set(raw, used + 1);
    return used === 0 ? raw : `${raw} (${used + 1})`;
  });

  return { headerRowIndex: chosen.i, headers };
}

/**
 * Every data row below the header, keyed by column name.
 *
 * Fully blank rows are skipped: a trailing run of empty rows is an artefact of how the file
 * was saved, not forty records with nothing in them. The rows that survive keep their real
 * spreadsheet numbers, so skipping never shifts what an error message points at.
 */
export function sheetRows(matrix: SheetMatrix, header: SheetHeader): readonly SheetRow[] {
  if (header.headerRowIndex < 0) return [];
  const out: SheetRow[] = [];
  for (let r = header.headerRowIndex + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    if (filled(row) === 0) continue;
    const cells: Record<string, SheetCell> = {};
    header.headers.forEach((name, col) => {
      const value = row[col];
      cells[name] = value === undefined ? null : value;
    });
    out.push({ rowNo: r + 1, cells });
  }
  return out;
}

/**
 * The first few rows, for the preview.
 *
 * A preview is the only moment before commit where an operator can notice that they picked
 * the wrong sheet, so it shows real rows from the real file rather than a count.
 */
export function sampleRows(rows: readonly SheetRow[], limit = 10): readonly SheetRow[] {
  return rows.slice(0, Math.max(0, limit));
}

/**
 * Cells rendered for display. Dates become ISO dates and nulls become empty strings so a
 * preview table can print them without every consumer re-deciding what a null looks like.
 */
export function displayCells(row: SheetRow): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.cells)) {
    out[key] =
      value === null
        ? ""
        : value instanceof Date
          ? // Local components, never toISOString — see `isoFromDate`. A preview that shows
            // the day before the file says is worse than no preview.
            isoFromDate(value)
          : String(value);
  }
  return out;
}
