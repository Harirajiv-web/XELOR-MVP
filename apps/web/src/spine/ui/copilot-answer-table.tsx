import { humanise } from "../format";
import { cn } from "./cn";

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function columnsOf(rows: ReadonlyArray<Record<string, unknown>>): readonly string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) columns.add(key);
  }
  return [...columns];
}

function columnLabel(column: string): string {
  const plain = humanise(column.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
  return plain
    .split(" ")
    .map((word) =>
      ["id", "uom", "gstin", "pan", "po", "so", "wo", "mrp", "bom"].includes(
        word.toLowerCase(),
      )
        ? word.toUpperCase()
        : word,
    )
    .join(" ");
}

/** A successful Copilot response expressed only as columns and rows. */
export function CopilotAnswerTable({
  rows,
  compact = false,
}: {
  rows: ReadonlyArray<Record<string, unknown>>;
  compact?: boolean;
}): React.JSX.Element {
  const displayRows = rows.length > 0 ? rows : [{ result: "No matching records" }];
  const columns = columnsOf(displayRows);

  return (
    <div
      data-testid="copilot-answer-table"
      className={cn(
        "overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface)]",
        compact && "text-[10px]",
      )}
    >
      <table className="grid-table" aria-label="Copilot answer">
        <caption className="sr-only">Copilot answer in tabular form</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column}>{displayValue(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
