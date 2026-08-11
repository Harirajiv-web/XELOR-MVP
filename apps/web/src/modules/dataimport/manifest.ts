import type { ModuleAlert, ModuleManifest } from "@spine/registry/manifest";
import { dataImportApi } from "./api";

/**
 * DATA IMPORT (HEXA) — spreadsheets as a first-class way in.
 *
 * Most of the factories this product is sold into keep their real operational data in Excel:
 * the customer list, the part master, the opening stock somebody counted on a Saturday.
 * Treating that as a one-off onboarding chore is how an ERP acquires a data-entry backlog
 * nobody ever clears, so an import is a permanent, governed integration path with the same
 * evidence trail as every other inbound route.
 *
 * WHY IT SITS UNDER INTEGRATION'S PERMISSIONS. A spreadsheet IS one of this plant's
 * integrations, and it uses `integration.flow.read` / `integration.flow.manage` rather than
 * minting a permission of its own. Neither of those grants the right to create anything:
 * every row is posted through the entity's own endpoint with the operator's credentials, so
 * `sales.customer.create` is still checked for every customer an import creates. Someone who
 * may upload a file but may not create customers gets a 403 per row, recorded against the
 * row. A spreadsheet is not a way around the RBAC wall.
 *
 * `licenceKey: "integration"` for the same reason: this is part of what a customer buys when
 * they buy the ability to connect XELOR to what they already run.
 */
function field(row: unknown, key: string): unknown {
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>)[key] : undefined;
}

function str(row: unknown, key: string): string {
  const v = field(row, key);
  return typeof v === "string" ? v : "";
}

function count(row: unknown, key: string): number | null {
  const v = field(row, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(row: unknown, key: string): boolean {
  return field(row, key) === true;
}

function rowsOf(data: unknown): readonly unknown[] | null {
  const items = field(data, "items");
  return Array.isArray(items) ? items : null;
}

/** The eight most recent, plus one line accounting for the rest. */
const ALERT_CAP = 8;

export const dataImportManifest: ModuleManifest = {
  key: "dataimport",
  name: "Data import",
  summary:
    "Bring the spreadsheets a factory already runs on into the system, through the same doors the forms use.",
  department: "HEXA",
  icon: "FileSpreadsheet",
  licenceKey: "integration",
  // Immediately after Integration: same department, same job, different transport.
  order: 111,
  nav: [
    {
      label: "Import a spreadsheet",
      path: "run",
      permission: "integration.flow.manage",
      icon: "Upload",
      description:
        "A five-step wizard for a CSV or Excel file: pick what you are importing, choose the sheet, say which column is which field, see exactly which rows would be refused and why, then import the rest. Nothing is written until the last step. Every accepted row is created through the module's own endpoint, so the duplicate check, the GST validation and your own permissions all still apply — a spreadsheet is not a way around them. Files up to 64 KB per import in this build.",
    },
    {
      label: "Import history",
      path: "history",
      permission: "integration.flow.read",
      icon: "History",
      description:
        "Every spreadsheet ever imported into this tenant, and what became of each row — including the rows that were refused, the cell that caused it and the reason given. This is where \"why is this part not in the system?\" is answered months later. A part-completed import is shown as partly imported rather than rounded up to done, because that is the screen that stops somebody re-uploading the whole file.",
    },
  ],
  screens: {
    run: () => import("./screens/import"),
    history: () => import("./screens/history"),
  },
  /**
   * One figure: what came in, and whether any of it needs a person.
   *
   * Read off the batch list the history screen shows, so the tile and the screen cannot
   * disagree. No model is consulted and none could be — these are counts of rows.
   */
  signals: [
    {
      label: "Imports",
      permission: "integration.flow.read",
      path: dataImportApi.batchesPath,
      query: { limit: 25 },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        const unfinished = rows.filter((r) => str(r, "status") === "partial").length;
        const failed = rows.filter((r) => str(r, "status") === "failed").length;
        const imported = rows.reduce<number>(
          (total, r) => total + (count(r, "importedCount") ?? 0),
          0,
        );
        return {
          value: String(imported),
          hint:
            rows.length === 0
              ? "No spreadsheet imported yet"
              : failed > 0
                ? `${failed} import${failed === 1 ? "" : "s"} created nothing`
                : unfinished > 0
                  ? `${unfinished} only partly imported`
                  : `across ${rows.length} import${rows.length === 1 ? "" : "s"}`,
          tone: failed > 0 ? "bad" : unfinished > 0 ? "warn" : "ok",
        };
      },
    },
  ],
  /**
   * WHAT THIS MODULE INTERRUPTS SOMEBODY FOR.
   *
   * Exactly one thing: an import that did not finish. A partly-imported file is the state
   * that quietly rots — the operator saw a green-ish summary, closed the tab, and forty
   * customers are missing with nothing on any screen to say so. It has an owner, a screen
   * and a fix, so it earns a place in the bell.
   *
   * Deliberately NOT alerted: rows refused because the file was wrong. Those are the
   * import doing its job, they were shown on the wizard's check step at the time, and they
   * do not develop over time — a bell that rings for them rings for every import.
   */
  alerts: [
    {
      permission: "integration.flow.read",
      path: dataImportApi.batchesPath,
      query: { limit: 25 },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return [];
        const stuck = rows.filter((r) => {
          const status = str(r, "status");
          return status === "running" || bool(r, "resumable");
        });
        const alerts = stuck.flatMap((r): readonly ModuleAlert[] => {
          const id = str(r, "id");
          if (!id) return [];
          const status = str(r, "status");
          const resumable = bool(r, "resumable");
          const filename = str(r, "filename") || "a spreadsheet";
          const imported = count(r, "importedCount") ?? 0;
          const total = count(r, "rowCount") ?? 0;
          return [
            {
              // The batch's own id: one alert per unfinished import, stable until it is dealt
              // with, and gone once it is.
              id: `dataimport.batch.${id}`,
              severity: status === "failed" ? "urgent" : "attention",
              title:
                status === "running"
                  ? `The import of ${filename} has not reported finishing`
                  : resumable
                    ? `${filename} has accepted rows waiting to resume`
                    : `${filename} imported ${imported} of ${total} rows`,
              body: resumable
                ? "Accepted rows are still waiting. Re-uploading the identical file continues only those rows; imported, invalid and duplicate-held rows are not repeated."
                : "Open Import history for the row-by-row outcome and the recorded reasons.",
              href: "/dataimport/history",
              at: str(r, "startedAt") || undefined,
              evidence: `Import of ${filename} (sheet ${str(r, "sheetName") || "?"}) as ${
                str(r, "target") || "unknown"
              } — ${imported} imported, ${count(r, "rejectedCount") ?? 0} invalid, ${
                count(r, "failedCount") ?? 0
              } refused.`,
            },
          ];
        });
        if (alerts.length <= ALERT_CAP) return alerts;
        return [
          ...alerts.slice(0, ALERT_CAP),
          {
            id: "dataimport.batch.more",
            severity: "attention",
            title: `${alerts.length} imports did not finish — the ${ALERT_CAP} most recent are listed above`,
            body: "The rest are on the Import history screen with the same row-by-row detail.",
            href: "/dataimport/history",
          },
        ];
      },
    },
  ],
};
