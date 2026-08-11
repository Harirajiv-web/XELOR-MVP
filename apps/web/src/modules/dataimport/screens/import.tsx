"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { num } from "@spine/format";
import type { ScreenProps } from "@spine/registry/manifest";
import { SourceBadge, fileSize } from "../source-badge";
import {
  ACCEPTED_FILE_TYPES,
  MAX_IMPORT_BYTES,
  dataImportApi,
  issueKindLabel,
  rowStatusLabel,
  rowTone,
  type BatchDetail,
  type ImportTargetSpec,
  type InspectResponse,
  type TargetsResponse,
  type ValidateResponse,
  type ValidatedRow,
} from "../api";

/**
 * THE IMPORT WIZARD.
 *
 * Five steps, in the order somebody actually works: choose the file, choose the sheet, say
 * which column is which field, look at what would happen, then do it. The first four write
 * nothing, and that is the point — an operator can upload the wrong file, map the wrong
 * column and see the consequences without having caused any.
 *
 * THREE THINGS THIS SCREEN REFUSES TO DO, EACH BECAUSE THE ALTERNATIVE IS WORSE:
 *
 *  1. IT NEVER IMPORTS "THE GOOD ONES" WITHOUT SHOWING THE BAD ONES FIRST. The check step
 *     lists every refused row with its spreadsheet row number and the cell that caused it.
 *     An importer that quietly drops 40 of 400 rows produces a master that is wrong in a way
 *     nobody will ever audit, because nothing recorded that the 40 existed.
 *
 *  2. IT NEVER GUESSES A MAPPING AND HIDES IT. The suggestion comes from the server and every
 *     field stays editable, on screen, before anything is validated. A file where "Rate" was
 *     silently mapped to the credit limit imports perfectly and is completely false.
 *
 *  3. IT NEVER SHOWS AN UPLOADED FILE AS THOUGH IT WERE A LIVE SOURCE. The badge is on every
 *     step. See `source-badge.tsx`.
 *
 * The fields, their types and what is required all come from `GET /dataimport/targets` — the
 * same specification the server validates against. Nothing about a customer or an item is
 * written down twice.
 */

type Step = "file" | "sheet" | "map" | "check" | "done";

const STEPS: readonly { key: Step; label: string }[] = [
  { key: "file", label: "File" },
  { key: "sheet", label: "Sheet" },
  { key: "map", label: "Columns" },
  { key: "check", label: "Check" },
  { key: "done", label: "Imported" },
];

/** The file, as the browser read it. `base64` is what the API takes — see the API module. */
interface PickedFile {
  name: string;
  size: number;
  base64: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("This file could not be read from the disk."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // readAsDataURL gives "data:...;base64,XXXX". The payload is everything after the
      // comma; the API accepts either form, and sending the bare payload keeps the request
      // body the size it needs to be.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export default function ImportScreen(_props: ScreenProps): React.JSX.Element {
  const targets = useQuery<TargetsResponse>(dataImportApi.targetsPath);

  const [step, setStep] = useState<Step>("file");
  const [targetKey, setTargetKey] = useState<string>("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [inspection, setInspection] = useState<InspectResponse | null>(null);
  const [sheet, setSheet] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "import_anyway">("skip");
  const [result, setResult] = useState<BatchDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Belt and braces against a double-fire: the button is disabled while in flight and this
  // stops a second tap that arrives before React has re-rendered.
  const inFlight = useRef(false);

  const target: ImportTargetSpec | undefined = useMemo(
    () => targets.data?.targets.find((t) => t.key === targetKey),
    [targets.data, targetKey],
  );

  function reset(): void {
    setStep("file");
    setFile(null);
    setInspection(null);
    setSheet("");
    setMapping({});
    setValidation(null);
    setResult(null);
    setError(null);
  }

  async function guarded(work: () => Promise<void>): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function pickFile(picked: File | undefined): Promise<void> {
    if (!picked || !target) return;
    if (picked.size > MAX_IMPORT_BYTES) {
      // Refused here rather than after an upload, so the operator learns the limit in a
      // second instead of after a slow round trip that ends in a 413.
      setError(
        new Error(
          `${picked.name} is ${fileSize(picked.size)}. This build imports files up to ` +
            `${fileSize(MAX_IMPORT_BYTES)} at a time — split the sheet and import it in parts.`,
        ),
      );
      return;
    }
    await guarded(async () => {
      const base64 = await readFileAsBase64(picked);
      const next: PickedFile = { name: picked.name, size: picked.size, base64 };
      const found = await api.post<InspectResponse>(dataImportApi.inspectPath, {
        fileBase64: base64,
        filename: picked.name,
        target: target.key,
      });
      setFile(next);
      setInspection(found);
      setSheet(found.selectedSheet);
      setMapping({ ...(found.suggestedMapping ?? {}) });
      // A single-sheet file has no sheet to choose. Showing a picker with one option is a
      // step that exists only to be clicked through.
      setStep(found.sheets.length > 1 ? "sheet" : "map");
    });
  }

  async function chooseSheet(name: string): Promise<void> {
    if (!file || !target) return;
    await guarded(async () => {
      const found = await api.post<InspectResponse>(dataImportApi.inspectPath, {
        fileBase64: file.base64,
        filename: file.name,
        sheet: name,
        target: target.key,
      });
      setSheet(name);
      setInspection(found);
      setMapping({ ...(found.suggestedMapping ?? {}) });
      setStep("map");
    });
  }

  async function check(): Promise<void> {
    if (!file || !target) return;
    await guarded(async () => {
      const checked = await api.post<ValidateResponse>(dataImportApi.validatePath, {
        fileBase64: file.base64,
        filename: file.name,
        sheet,
        target: target.key,
        mapping: cleanMapping(mapping),
      });
      setValidation(checked);
      setStep("check");
    });
  }

  async function commit(): Promise<void> {
    if (!file || !target) return;
    await guarded(async () => {
      // No explicit Idempotency-Key: the API client derives a stable one from this exact
      // body and keeps it until a definitive answer, so a retry after a dropped connection
      // replays rather than repeats. The server is idempotent per batch as well — the same
      // file, mapping and target resumes rather than starting again.
      const batch = await api.post<BatchDetail>(dataImportApi.commitPath, {
        fileBase64: file.base64,
        filename: file.name,
        sheet,
        target: target.key,
        mapping: cleanMapping(mapping),
        onDuplicate,
      });
      setResult(batch);
      setStep("done");
    });
  }

  if (targets.loading) return <Loading label="Loading what can be imported…" />;
  if (targets.error) return <ErrorState error={targets.error} onRetry={targets.reload} />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Import a spreadsheet"
        subtitle="Bring a CSV or Excel file into the system through the same doors the forms use."
        meta={[
          { label: "Formats", value: "CSV · XLSX · XLS" },
          { label: "Limit", value: `${fileSize(MAX_IMPORT_BYTES)} per file` },
        ]}
        actions={
          file ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Start again
            </button>
          ) : undefined
        }
      />

      <Stepper current={step} />

      {file ? (
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge kind="file" label={file.name} detail={fileSize(file.size)} />
          {sheet ? (
            <span className="text-[12px] text-[var(--text-muted)]">
              Sheet <b className="text-[var(--text-secondary)]">{sheet}</b>
              {inspection?.headerRowNo
                ? ` · column names read from row ${inspection.headerRowNo}`
                : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? <ErrorState error={error} /> : null}

      {step === "file" ? (
        <ChooseFile
          targets={targets.data?.targets ?? []}
          targetKey={targetKey}
          onTarget={setTargetKey}
          busy={busy}
          onFile={(f) => void pickFile(f)}
        />
      ) : null}

      {step === "sheet" && inspection ? (
        <ChooseSheet inspection={inspection} busy={busy} onChoose={(n) => void chooseSheet(n)} />
      ) : null}

      {step === "map" && inspection && target ? (
        <MapColumns
          inspection={inspection}
          target={target}
          mapping={mapping}
          onChange={setMapping}
          busy={busy}
          onBack={() => setStep(inspection.sheets.length > 1 ? "sheet" : "file")}
          onNext={() => void check()}
        />
      ) : null}

      {step === "check" && validation && target ? (
        <CheckRows
          validation={validation}
          target={target}
          onDuplicate={onDuplicate}
          setOnDuplicate={setOnDuplicate}
          busy={busy}
          onBack={() => setStep("map")}
          onImport={() => void commit()}
        />
      ) : null}

      {step === "done" && result ? <Summary batch={result} onAgain={reset} /> : null}
    </div>
  );
}

/** Blank selections mean "not imported" and are dropped rather than sent as empty strings. */
function cleanMapping(mapping: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapping).filter(([, header]) => header !== ""));
}

/* ------------------------------- the stepper ------------------------------ */

function Stepper({ current }: { current: Step }): React.JSX.Element {
  const index = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Import steps">
      {STEPS.map((s, i) => {
        const state = i < index ? "done" : i === index ? "current" : "todo";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={
                state === "current"
                  ? "chip chip-info"
                  : state === "done"
                    ? "chip chip-ok"
                    : "chip chip-grey"
              }
            >
              {i + 1}. {s.label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="text-[var(--text-muted)]" aria-hidden>
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------- step 1: file ----------------------------- */

function ChooseFile({
  targets,
  targetKey,
  onTarget,
  busy,
  onFile,
}: {
  targets: readonly ImportTargetSpec[];
  targetKey: string;
  onTarget: (key: string) => void;
  busy: boolean;
  onFile: (file: File | undefined) => void;
}): React.JSX.Element {
  const target = targets.find((t) => t.key === targetKey);
  return (
    <div className="card">
      <div className="panel-h">
        What are you importing?
        <span className="panel-h-sub">Nothing is written until the last step</span>
      </div>
      <div className="panel-b flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {targets.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTarget(t.key)}
              className="rounded-[10px] border p-3 text-left transition-colors"
              style={{
                borderColor:
                  t.key === targetKey ? "var(--brand)" : "var(--border-subtle)",
                background:
                  t.key === targetKey ? "var(--brand-soft)" : "var(--surface)",
              }}
            >
              <div className="text-[13px] font-semibold text-[var(--text-primary)]">{t.label}</div>
              <div className="mt-1 text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                {t.creates}
              </div>
            </button>
          ))}
        </div>

        {target ? (
          <p className="max-w-prose text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
            {target.description}
          </p>
        ) : null}

        <div>
          <label className="field-label" htmlFor="import-file">
            The file
          </label>
          <input
            id="import-file"
            type="file"
            className="field"
            accept={ACCEPTED_FILE_TYPES}
            disabled={!target || busy}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <p className="mt-2 text-[11.5px] text-[var(--text-muted)]">
            {target
              ? "CSV, XLSX or XLS. The first sheet is read unless you pick another one."
              : "Choose what you are importing first — the columns it needs depend on it."}
          </p>
        </div>

        {busy ? (
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Reading the file…
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------ step 2: sheet ----------------------------- */

function ChooseSheet({
  inspection,
  busy,
  onChoose,
}: {
  inspection: InspectResponse;
  busy: boolean;
  onChoose: (name: string) => void;
}): React.JSX.Element {
  return (
    <div className="card">
      <div className="panel-h">
        Which sheet?
        <span className="panel-h-sub">{inspection.sheets.length} sheets in this workbook</span>
      </div>
      <div className="panel-b grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inspection.sheets.map((s) => (
          <button
            key={s.name}
            type="button"
            disabled={busy}
            onClick={() => onChoose(s.name)}
            className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-left"
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{s.name}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--text-secondary)]">
              {/* A sheet with no rows is usually a notes tab, and saying so stops somebody
                  picking it and concluding the import is broken. */}
              {s.rowCount === 0
                ? "No data rows — probably notes"
                : `${num(s.rowCount)} row${s.rowCount === 1 ? "" : "s"} · ${s.headers.length} columns`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ step 3: mapping --------------------------- */

function MapColumns({
  inspection,
  target,
  mapping,
  onChange,
  busy,
  onBack,
  onNext,
}: {
  inspection: InspectResponse;
  target: ImportTargetSpec;
  mapping: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  busy: boolean;
  onBack: () => void;
  onNext: () => void;
}): React.JSX.Element {
  const used = new Set(Object.values(mapping).filter(Boolean));
  const missing = target.fields.filter((f) => f.required && !mapping[f.field]);
  const ignored = inspection.headers.filter((h) => !used.has(h));

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="panel-h">
          Which column is which?
          <span className="panel-h-sub">
            {num(inspection.rowCount)} row{inspection.rowCount === 1 ? "" : "s"} to import
          </span>
        </div>
        <div className="panel-b flex flex-col gap-4">
          <p className="max-w-prose text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
            These are matched from your column names as a starting point. Check them — a column
            mapped to the wrong field imports perfectly and is completely wrong.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {target.fields.map((f) => (
              <div key={f.field}>
                <label
                  className={f.required ? "field-label field-req" : "field-label"}
                  htmlFor={`map-${f.field}`}
                >
                  {f.label}
                </label>
                <select
                  id={`map-${f.field}`}
                  className="field"
                  value={mapping[f.field] ?? ""}
                  onChange={(e) => onChange({ ...mapping, [f.field]: e.target.value })}
                >
                  <option value="">— not imported —</option>
                  {inspection.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {f.help ? (
                  <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-muted)]">{f.help}</p>
                ) : null}
                {f.type === "enum" && f.enumValues ? (
                  <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-muted)]">
                    One of: {f.enumValues.join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {ignored.length > 0 ? (
            // Said out loud rather than ignored quietly. A sheet carrying a "Credit Limit"
            // column that ended up mapped to nothing is a fact worth seeing before the
            // import, not after somebody asks why every customer has no limit.
            <p className="text-[12px] leading-[1.5] text-[var(--text-muted)]">
              <b className="text-[var(--text-secondary)]">Not imported:</b>{" "}
              {ignored.join(", ")} — these columns stay in your file and are ignored.
            </p>
          ) : null}

          {missing.length > 0 ? (
            <p className="flex items-start gap-2 text-[12.5px] leading-[1.5] text-[var(--bad-fg)]">
              <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0" aria-hidden />
              <span>
                {missing.map((f) => f.label).join(", ")} {missing.length === 1 ? "is" : "are"}{" "}
                required and no column is mapped to{" "}
                {missing.length === 1 ? "it" : "them"}.
              </span>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-pri"
              onClick={onNext}
              disabled={busy || missing.length > 0}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              )}
              {busy ? "Checking…" : "Check the rows"}
            </button>
          </div>
        </div>
      </div>

      <Preview inspection={inspection} mapped={used} />
    </div>
  );
}

function Preview({
  inspection,
  mapped,
}: {
  inspection: InspectResponse;
  mapped: ReadonlySet<string>;
}): React.JSX.Element {
  return (
    <div className="card overflow-hidden">
      <div className="panel-h">
        The first rows of your file
        <span className="panel-h-sub">Row numbers are the ones in your spreadsheet</span>
      </div>
      <div className="overflow-x-auto">
        <table className="grid-table">
          <caption className="sr-only">
            A sample of {inspection.selectedSheet} as this system read it
          </caption>
          <thead>
            <tr>
              <th className="w-16">Row</th>
              {inspection.headers.map((h) => (
                <th key={h}>
                  {h}
                  {!mapped.has(h) ? (
                    <span className="ml-1 font-normal text-[var(--text-muted)]">(ignored)</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inspection.sampleRows.map((r) => (
              <tr key={r.rowNo}>
                <td className="font-[var(--font-mono)] text-[var(--text-muted)]">{r.rowNo}</td>
                {inspection.headers.map((h) => (
                  <td
                    key={h}
                    style={{ color: mapped.has(h) ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {r.cells[h] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- step 4: check ---------------------------- */

function CheckRows({
  validation,
  target,
  onDuplicate,
  setOnDuplicate,
  busy,
  onBack,
  onImport,
}: {
  validation: ValidateResponse;
  target: ImportTargetSpec;
  onDuplicate: "skip" | "import_anyway";
  setOnDuplicate: (value: "skip" | "import_anyway") => void;
  busy: boolean;
  onBack: () => void;
  onImport: () => void;
}): React.JSX.Element {
  const rejected = validation.rows.filter((r) => r.status === "rejected");
  const flagged = validation.rows.filter(
    (r) => r.status === "accepted" && r.issues.length > 0,
  );
  const grouped = (target.groupBy?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="panel-h">
          What would happen
          <span className="panel-h-sub">Still nothing written</span>
        </div>
        <div className="panel-b flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-ok">
              {num(validation.acceptedCount)} row
              {validation.acceptedCount === 1 ? "" : "s"} ready
            </span>
            {grouped ? (
              <span className="chip chip-info">
                becoming {num(validation.documentCount)}{" "}
                {validation.documentCount === 1 ? "document" : "documents"}
              </span>
            ) : null}
            {validation.rejectedCount > 0 ? (
              <span className="chip chip-bad">
                {num(validation.rejectedCount)} refused
              </span>
            ) : null}
            {flagged.length > 0 ? (
              <span className="chip chip-warn">{num(flagged.length)} worth checking</span>
            ) : null}
          </div>

          {grouped ? (
            <p className="max-w-prose text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
              Rows sharing {target.groupBy?.join(" and ")} become one document with several
              lines, and they succeed or fail together — a half-created order is a promise
              nobody made.
            </p>
          ) : null}

          <div>
            <label className="field-label" htmlFor="on-duplicate">
              If a record looks like one that already exists
            </label>
            <select
              id="on-duplicate"
              className="field max-w-md"
              value={onDuplicate}
              onChange={(e) => setOnDuplicate(e.target.value as "skip" | "import_anyway")}
            >
              <option value="skip">Hold it and tell me (recommended)</option>
              <option value="import_anyway">Import anyway — these really are different</option>
            </select>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--text-muted)]">
              The duplicate check that runs on the form runs here too. Held rows are recorded
              with the explanation and create nothing.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
              Back to the columns
            </button>
            <button
              type="button"
              className="btn btn-pri"
              onClick={onImport}
              disabled={busy || validation.acceptedCount === 0}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {busy
                ? "Importing…"
                : `Import ${num(validation.acceptedCount)} row${
                    validation.acceptedCount === 1 ? "" : "s"
                  }`}
            </button>
          </div>
        </div>
      </div>

      {rejected.length > 0 ? (
        <RowIssues
          title={`${num(rejected.length)} row${rejected.length === 1 ? "" : "s"} will not be imported`}
          subtitle="Fix these in your file and upload it again. Nothing else is held up by them."
          rows={rejected}
          tone="bad"
        />
      ) : null}

      {flagged.length > 0 ? (
        <RowIssues
          title={`${num(flagged.length)} row${flagged.length === 1 ? "" : "s"} worth a second look`}
          subtitle="These will be imported. They are shown because a value could be read more than one way."
          rows={flagged}
          tone="warn"
        />
      ) : null}
    </div>
  );
}

function RowIssues({
  title,
  subtitle,
  rows,
  tone,
}: {
  title: string;
  subtitle: string;
  rows: readonly ValidatedRow[];
  tone: "bad" | "warn";
}): React.JSX.Element {
  return (
    <div className="card overflow-hidden">
      <div className="panel-h">
        <span style={{ color: tone === "bad" ? "var(--bad-fg)" : "var(--warn-fg)" }}>{title}</span>
        <span className="panel-h-sub">{subtitle}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="grid-table">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th className="w-16">Row</th>
              <th className="w-40">Column</th>
              <th className="w-32">Problem</th>
              <th>What it says, and why it was refused</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) =>
              row.issues.map((issue, i) => (
                <tr key={`${row.rowNo}-${issue.field}-${i}`}>
                  <td className="font-[var(--font-mono)] text-[var(--text-muted)]">{row.rowNo}</td>
                  <td className="font-semibold text-[var(--text-primary)]">{issue.label}</td>
                  <td>
                    <span className={tone === "bad" ? "chip chip-bad" : "chip chip-warn"}>
                      {issueKindLabel(issue.kind)}
                    </span>
                  </td>
                  <td>
                    {issue.value ? (
                      <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
                        “{issue.value}”
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">(blank)</span>
                    )}
                    <div className="text-[12px] leading-[1.5] text-[var(--text-secondary)]">
                      {issue.message}
                    </div>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- step 5: done ----------------------------- */

function Summary({
  batch,
  onAgain,
}: {
  batch: BatchDetail;
  onAgain: () => void;
}): React.JSX.Element {
  const imported = batch.rows.filter((r) => r.status === "imported");
  const problems = batch.rows.filter(
    (r) => r.status === "failed" || r.status === "duplicate_suspected",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="panel-h">
          {batch.status === "completed"
            ? "Imported"
            : batch.status === "partial"
              ? "Partly imported"
              : "Nothing was imported"}
          <span className="panel-h-sub">{batch.creates}</span>
        </div>
        <div className="panel-b flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <SourceBadge
              kind="file"
              label={batch.source.filename}
              detail={fileSize(batch.source.byteSize)}
            />
            <span className="chip chip-ok">{num(batch.summary.imported)} imported</span>
            {batch.summary.duplicatesHeld > 0 ? (
              <span className="chip chip-warn">
                {num(batch.summary.duplicatesHeld)} held as possible duplicates
              </span>
            ) : null}
            {batch.summary.failed > 0 ? (
              <span className="chip chip-bad">{num(batch.summary.failed)} refused</span>
            ) : null}
            {batch.summary.rejected > 0 ? (
              <span className="chip chip-grey">
                {num(batch.summary.rejected)} not sent — invalid rows
              </span>
            ) : null}
            {batch.summary.stillPending > 0 ? (
              <span className="chip chip-warn">
                {num(batch.summary.stillPending)} accepted and waiting to resume
              </span>
            ) : null}
          </div>

          <p className="max-w-prose text-[12.5px] leading-[1.6] text-[var(--text-secondary)]">
            {/* The whole record is kept, including what failed. That is the sentence that
                stops somebody re-uploading the entire file to "make sure". */}
            This import is recorded in full, row by row, under <b>Import history</b> — including
            the rows that were refused and why.{" "}
            {batch.resumable
              ? "Re-uploading the identical file continues only the accepted rows still waiting; rows already decided are not repeated."
              : "There are no accepted rows waiting to resume. To retry a refused or invalid row, correct the file or mapping; to override a held duplicate, make that explicit duplicate decision."}
          </p>

          <div>
            <button type="button" className="btn btn-ghost" onClick={onAgain}>
              Import another file
            </button>
          </div>
        </div>
      </div>

      {problems.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="panel-h">
            <span style={{ color: "var(--bad-fg)" }}>
              {num(problems.length)} row{problems.length === 1 ? "" : "s"} did not go in
            </span>
            <span className="panel-h-sub">The reason each one was refused, as it was given</span>
          </div>
          <div className="overflow-x-auto">
            <table className="grid-table">
              <caption className="sr-only">Rows that were not imported</caption>
              <thead>
                <tr>
                  <th className="w-16">Row</th>
                  <th className="w-56">Outcome</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((r) => (
                  <tr key={r.rowNo}>
                    <td className="font-[var(--font-mono)] text-[var(--text-muted)]">{r.rowNo}</td>
                    <td>
                      <span className={`chip chip-${rowTone(r.status)}`}>
                        {rowStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
                      {r.failureMessage ?? "No reason was recorded."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {imported.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="panel-h">
            {num(imported.length)} created
            <span className="panel-h-sub">Each one went in through its own module's endpoint</span>
          </div>
          <div className="overflow-x-auto">
            <table className="grid-table">
              <caption className="sr-only">Records created by this import</caption>
              <thead>
                <tr>
                  <th className="w-16">Row</th>
                  <th>Created</th>
                  <th className="w-48">When</th>
                </tr>
              </thead>
              <tbody>
                {imported.map((r) => (
                  <tr key={r.rowNo}>
                    <td className="font-[var(--font-mono)] text-[var(--text-muted)]">{r.rowNo}</td>
                    <td className="font-semibold text-[var(--text-primary)]">
                      {r.resultRef ?? r.resultId ?? "—"}
                    </td>
                    <td className="text-[12px] text-[var(--text-muted)]">
                      {r.importedAt ? new Date(r.importedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
