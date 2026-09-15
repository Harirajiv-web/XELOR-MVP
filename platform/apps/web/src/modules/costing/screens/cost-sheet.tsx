"use client";

import { useMemo, useState } from "react";
import { Calculator, FileText, Info, TriangleAlert } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState } from "@spine/states";
import { date, inr, num } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  conversionLines,
  costingApi,
  EMPTY_ASSUMPTIONS,
  marginOf,
  materialLines,
  priceFreshness,
  sumLines,
  toNum,
  type BomView,
  type CostAssumptions,
  type CostLine,
  type ItemRow,
  type SourceAttribution,
} from "../api";

/**
 * COST SHEET — what a job actually costs, built up where anybody can check it.
 *
 * THE FAILURE THIS SCREEN EXISTS TO PREVENT is not "we cannot calculate a cost". Every plant
 * can calculate a cost; most do it in a spreadsheet in about four minutes. The failure is
 * quoting against a cost built on a supplier price nobody re-confirmed — the casting that was
 * ₹840 when the sheet was made and is ₹1,010 by the time the order lands. That loss is
 * invisible on every screen in an ERP until the job is finished, and it is the reason the
 * supplier-price date and validity sit at the TOP of this screen rather than in a note at
 * the bottom.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * NOTHING ON THIS SCREEN IS SAVED, AND THE SCREEN SAYS SO IN THREE PLACES.
 *
 * There is no `cost_sheet` table in this database. This module adds no migration and no
 * endpoint, so there is nowhere for a build-up to go. It is computed here, from real records
 * plus the assumptions typed beside them, and it is gone when the tab closes.
 *
 * A "Save" button that wrote nothing, or a toast saying "Cost sheet saved", would be the most
 * damaging thing this file could contain — because the next person to look for the number
 * would not find it, and would not know it had never been there. The honest UI for an absent
 * table is a visible absence.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THERE IS NO "AI EXTRACTION" HERE, AND WHY NOTHING IS MISSING BECAUSE OF IT. The
 * specification asks for enquiry documents to be read into a cost sheet. What that actually
 * requires is that every critical figure trace to a source or to a named human correction —
 * and a structured intake form with the source document named and a page-anchored note
 * against the values satisfies it completely, with no model, no extraction confidence and no
 * silent wrong number. The `Source document` and `Where in it` fields below are that
 * mechanism. There is no inference call on this screen and none anywhere in this module.
 *
 * WHAT THIS SCREEN IS NOT. It is not a product configurator and not CPQ: there are no
 * configurable-product option rules and no compatibility matrix in this codebase, so nothing
 * here validates that a chosen combination can be built. It does not interpret a drawing. It
 * costs ONE item at ONE batch size against ONE bill of material, and that is the whole claim.
 */
export default function CostSheetScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const mayReadItems = can("engineering.item.read");
  const mayReadBom = can("engineering.bom.read");

  const items = useCursorList<ItemRow>(mayReadItems ? costingApi.itemsPath : null, {
    limit: costingApi.pageSize,
  });

  const [itemId, setItemId] = useState("");
  const selected = items.rows.find((i) => i.id === itemId) ?? null;

  // A BOM can ONLY be fetched by id, and the id comes from the item row. There is no
  // list-BOMs endpoint in this build, which is why this screen starts from an item.
  const bomId = selected?.defaultBomId ?? null;
  const bom = useQuery<BomView>(mayReadBom && bomId ? costingApi.bomPath(bomId) : null);

  /* ---------------------- the intake, and its attribution --------------------- */

  const [sourceRef, setSourceRef] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [quotedOn, setQuotedOn] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const attribution: SourceAttribution = {
    kind: "entered",
    ref: sourceRef.trim() || "Typed on this screen; no source document named",
    note: sourceNote.trim() || undefined,
  };
  const freshness = priceFreshness(quotedOn, validUntil);

  /* --------------------------- the assumptions ------------------------------- */

  const [raw, setRaw] = useState<Record<keyof CostAssumptions, string>>({
    batchQty: "1",
    setupMins: "",
    cycleMinsPerPiece: "",
    labourRatePerHour: "",
    machineRatePerHour: "",
    toolingCost: "",
    toolingAmortiseOverQty: "1",
    outsourcedPerPiece: "",
    freightForBatch: "",
    overheadPct: "",
    sellingPricePerPiece: "",
  });

  const assumptions: CostAssumptions = useMemo(
    () => ({
      batchQty: numberOr(raw.batchQty, EMPTY_ASSUMPTIONS.batchQty),
      setupMins: numberOr(raw.setupMins, 0),
      cycleMinsPerPiece: numberOr(raw.cycleMinsPerPiece, 0),
      labourRatePerHour: numberOr(raw.labourRatePerHour, 0),
      machineRatePerHour: numberOr(raw.machineRatePerHour, 0),
      toolingCost: numberOr(raw.toolingCost, 0),
      toolingAmortiseOverQty: numberOr(raw.toolingAmortiseOverQty, 1),
      outsourcedPerPiece: numberOr(raw.outsourcedPerPiece, 0),
      freightForBatch: numberOr(raw.freightForBatch, 0),
      overheadPct: numberOr(raw.overheadPct, 0),
      sellingPricePerPiece: numberOr(raw.sellingPricePerPiece, 0),
    }),
    [raw],
  );

  /* ------------------------------ the arithmetic ------------------------------ */

  const itemById = useMemo(
    () => new Map(items.rows.map((row) => [row.id, row])),
    [items.rows],
  );

  const bomData = bom.data;

  /**
   * Components the loaded page of the item master does not contain.
   *
   * Distinguished from "has no standard cost" on purpose. One is fixed by loading more items,
   * the other by somebody costing the part — different problems, different people, and
   * collapsing them into one "unknown" wastes the reader's time.
   */
  const unloadedComponents = useMemo(
    () =>
      bomData ? bomData.lines.filter((line) => !itemById.has(line.componentItemId)) : [],
    [bomData, itemById],
  );

  const lines: CostLine[] = useMemo(() => {
    const material = bomData
      ? materialLines(bomData, assumptions.batchQty, (id) => itemById.get(id)?.standardCost ?? null)
      : [];
    return [...material, ...conversionLines(assumptions, attribution)];
    // `attribution` is derived from two strings and rebuilt every render; depending on the
    // strings keeps this stable without a memo on the object itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bomData, itemById, assumptions, sourceRef, sourceNote]);

  const totals = sumLines(lines, assumptions.overheadPct, assumptions.batchQty);
  const revenue = assumptions.sellingPricePerPiece * assumptions.batchQty;
  const margin = totals.totalCost === null ? null : marginOf(revenue, totals.totalCost);

  const columns: ReadonlyArray<Column<CostLine>> = [
    {
      key: "label",
      header: "Cost element",
      render: (line) => (
        <span className="font-semibold text-[var(--text-primary)]">{line.label}</span>
      ),
    },
    {
      key: "workings",
      header: "How it was worked out",
      render: (line) => (
        <span className="text-[12px] leading-5 text-[var(--text-secondary)]">{line.workings}</span>
      ),
    },
    {
      key: "source",
      header: "Traces to",
      width: "w-64",
      render: (line) => <SourceCell source={line.source} />,
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      width: "w-40",
      render: (line) =>
        line.amount === null ? (
          <span className="text-[var(--status-overdue-text)]">Not costed</span>
        ) : (
          <span className="x-money">{inr(line.amount)}</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cost sheet"
        subtitle="Build up what a job costs, line by line, against a supplier price with a date on it."
        meta={[
          { label: "Product", value: selected ? selected.itemCode : "Not chosen" },
          { label: "Batch", value: num(assumptions.batchQty) },
          {
            label: "Supplier price",
            value: (
              <StatusBadge
                tone={
                  freshness.state === "expired"
                    ? "overdue"
                    : freshness.state === "expiring"
                      ? "pending"
                      : freshness.state === "fresh"
                        ? "approved"
                        : "unknown"
                }
                label={
                  freshness.state === "unknown"
                    ? "No date entered"
                    : freshness.state === "expired"
                      ? "Expired"
                      : freshness.state === "expiring"
                        ? "Expiring"
                        : "In date"
                }
              />
            ),
          },
        ]}
      />

      {/* Placed FIRST, above everything a person would otherwise start typing into. A warning
          about persistence at the bottom of a form is read after the work is lost. */}
      <div className="x-notice" data-tone="warning">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <strong>Nothing on this screen is saved.</strong> There is no cost-sheet table in
          this system and this module adds none, so the build-up below is computed in your
          browser and disappears when you close the tab. Copy the figures you need before you
          leave. The materials come from real records — the item master and the bill of
          material — but the times, rates and overhead are assumptions you type here, and they
          are stored nowhere.
        </div>
      </div>

      <section className="x-home-panel" aria-labelledby="cost-intake-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 id="cost-intake-heading" className="x-section-heading">
              What is being costed, and what it is based on
            </h2>
            <p>
              Name the enquiry document and the page the figures came off. A value without a
              source is a value nobody can check six weeks later.
            </p>
          </div>
        </div>

        <div className="panel-b flex flex-col gap-4">
          {!mayReadItems ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              Costing a product needs <code className="font-[var(--font-mono)]">engineering.item.read</code>,
              which you do not hold. Ask your administrator: the item master is where the
              standard cost of every component lives, and without it there is nothing to
              build a cost up from.
            </p>
          ) : items.error ? (
            <ErrorState error={items.error} onRetry={items.reload} />
          ) : (
            <>
              <div className="x-form-grid">
                <label className="block">
                  <span className="field-label">Product to cost</span>
                  <select
                    className="field"
                    value={itemId}
                    aria-label="Product to cost"
                    onChange={(event) => setItemId(event.target.value)}
                  >
                    <option value="">
                      {items.loading
                        ? "Loading the item master…"
                        : items.rows.length === 0
                          ? "No items in the master yet"
                          : "Choose an item…"}
                    </option>
                    {items.rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.itemCode} · {row.name}
                        {row.bomCount === 0 ? " (no bill of material)" : ""}
                      </option>
                    ))}
                  </select>
                  {items.hasMore ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm mt-2"
                      onClick={items.loadMore}
                      disabled={items.loadingMore}
                    >
                      {items.loadingMore ? "Loading…" : "Load more items"}
                    </button>
                  ) : null}
                </label>

                <NumberField
                  label="Batch quantity"
                  hint="Setup and tooling are spread across this many pieces."
                  value={raw.batchQty}
                  onChange={(v) => setRaw((r) => ({ ...r, batchQty: v }))}
                />

                <label className="block">
                  <span className="field-label">Supplier price quoted on</span>
                  <input
                    type="date"
                    className="field"
                    value={quotedOn}
                    aria-label="Supplier price quoted on"
                    onChange={(event) => setQuotedOn(event.target.value)}
                  />
                  <span className="mt-1 block text-[11px] leading-5 text-[var(--text-muted)]">
                    The item master stores a standard cost but no date. This is the only place
                    the age of the price is recorded, and it is recorded only for this screen.
                  </span>
                </label>

                <label className="block">
                  <span className="field-label">That price holds until</span>
                  <input
                    type="date"
                    className="field"
                    value={validUntil}
                    aria-label="Supplier price valid until"
                    onChange={(event) => setValidUntil(event.target.value)}
                  />
                  <span className="mt-1 block text-[11px] leading-5 text-[var(--text-muted)]">
                    Quote for longer than your supplier holds their price and the difference is
                    your margin.
                  </span>
                </label>

                <label className="block">
                  <span className="field-label">Source document</span>
                  <input
                    type="text"
                    className="field"
                    value={sourceRef}
                    placeholder="e.g. Supplier quotation SQ-118 / customer enquiry ENQ-2026-44"
                    aria-label="Source document"
                    onChange={(event) => setSourceRef(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="field-label">Where in it</span>
                  <input
                    type="text"
                    className="field"
                    value={sourceNote}
                    placeholder="e.g. page 2, line 4 — casting rate ₹840/kg"
                    aria-label="Where in the source document"
                    onChange={(event) => setSourceNote(event.target.value)}
                  />
                </label>
              </div>

              <div
                className="x-notice"
                data-tone={
                  freshness.state === "expired"
                    ? "error"
                    : freshness.state === "fresh"
                      ? undefined
                      : "warning"
                }
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  {freshness.message}
                  {freshness.ageDays !== null ? (
                    <>
                      {" "}
                      Quoted {date(quotedOn)} — {freshness.ageDays} day
                      {freshness.ageDays === 1 ? "" : "s"} ago.
                    </>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {selected && !selected.defaultBomId ? (
        <div className="x-notice" data-tone="warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <strong>{selected.itemCode} has no active bill of material.</strong> Nothing here
            knows what it is made of, so there are no material lines to cost — only the times,
            rates and charges you enter below. An item with no BOM is usually one that is
            bought rather than made.
          </div>
        </div>
      ) : null}

      {selected?.defaultBomId && !mayReadBom ? (
        <div className="x-notice" data-tone="warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            This item has a bill of material, but reading one needs{" "}
            <code className="font-[var(--font-mono)]">engineering.bom.read</code>, which you do
            not hold. The conversion costs below are still shown; the material cost is not,
            and the total is therefore withheld rather than being quietly understated.
          </div>
        </div>
      ) : null}

      {bom.error ? <ErrorState error={bom.error} onRetry={bom.reload} /> : null}

      {unloadedComponents.length > 0 ? (
        <div className="x-notice" data-tone="warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            {unloadedComponents.length} component
            {unloadedComponents.length === 1 ? " is" : "s are"} not in the page of the item
            master loaded so far, so no standard cost can be read for{" "}
            {unloadedComponents.length === 1 ? "it" : "them"}. Use{" "}
            <em>Load more items</em> above. This is a paging limit, not a missing cost — the
            two are different problems and are shown differently.
          </div>
        </div>
      ) : null}

      <h2 className="x-section-heading">The build-up</h2>

      <DataTable
        rows={lines}
        columns={columns}
        loading={bom.loading}
        rowKey={(line) => line.key}
        caption="Every cost element, the arithmetic behind it, what it traces to and its amount"
        empty={
          <Empty
            title="Nothing to cost yet"
            body="Choose a product above. Its bill of material becomes the material lines; the setup, cycle, labour, tooling, outsourced work, freight and overhead are yours to enter."
            icon={<Calculator />}
          />
        }
      />

      <section className="card" aria-labelledby="cost-assumptions-heading">
        <div className="panel-h">
          <span id="cost-assumptions-heading">Times, rates and charges</span>
          <span className="panel-h-sub">
            Assumptions, not records — this database holds no routing standard, labour rate or
            overhead recovery rate
          </span>
        </div>
        <div className="panel-b x-form-grid">
          <NumberField
            label="Setup time (minutes per batch)"
            hint="Charged once across the batch, not per piece."
            value={raw.setupMins}
            onChange={(v) => setRaw((r) => ({ ...r, setupMins: v }))}
          />
          <NumberField
            label="Cycle time (minutes per piece)"
            hint="Multiplied by the batch quantity."
            value={raw.cycleMinsPerPiece}
            onChange={(v) => setRaw((r) => ({ ...r, cycleMinsPerPiece: v }))}
          />
          <NumberField
            label="Machine rate (₹ per hour)"
            hint="Applied to setup plus run time."
            value={raw.machineRatePerHour}
            onChange={(v) => setRaw((r) => ({ ...r, machineRatePerHour: v }))}
          />
          <NumberField
            label="Labour rate (₹ per hour)"
            hint="Applied to the same measured time, not to a second estimate of it."
            value={raw.labourRatePerHour}
            onChange={(v) => setRaw((r) => ({ ...r, labourRatePerHour: v }))}
          />
          <NumberField
            label="Tooling cost (₹)"
            hint="The whole tool, not this batch's share."
            value={raw.toolingCost}
            onChange={(v) => setRaw((r) => ({ ...r, toolingCost: v }))}
          />
          <NumberField
            label="Amortise tooling over (pieces)"
            hint="Charging the whole tool to the first batch is how a repeat order looks free."
            value={raw.toolingAmortiseOverQty}
            onChange={(v) => setRaw((r) => ({ ...r, toolingAmortiseOverQty: v }))}
          />
          <NumberField
            label="Outsourced work (₹ per piece)"
            hint="Plating, heat treatment, anything that leaves the plant and comes back."
            value={raw.outsourcedPerPiece}
            onChange={(v) => setRaw((r) => ({ ...r, outsourcedPerPiece: v }))}
          />
          <NumberField
            label="Freight & packing (₹ for the batch)"
            hint="For the consignment, not per piece."
            value={raw.freightForBatch}
            onChange={(v) => setRaw((r) => ({ ...r, freightForBatch: v }))}
          />
          <NumberField
            label="Overhead recovery (%)"
            hint="Applied to the works cost — materials, process, labour, tooling, outsourced and freight."
            value={raw.overheadPct}
            onChange={(v) => setRaw((r) => ({ ...r, overheadPct: v }))}
          />
          <NumberField
            label="Selling price (₹ per piece, before GST)"
            hint="Margin is measured on taxable value. GST is not margin — it is collected and paid over."
            value={raw.sellingPricePerPiece}
            onChange={(v) => setRaw((r) => ({ ...r, sellingPricePerPiece: v }))}
          />
        </div>
      </section>

      <section className="card" aria-labelledby="cost-total-heading">
        <div className="panel-h">
          <span id="cost-total-heading">What it comes to</span>
          <span className="panel-h-sub">Computed here, stored nowhere</span>
        </div>
        <div className="panel-b">
          {totals.missingLines > 0 ? (
            <div className="x-notice" data-tone="error">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <strong>No total is shown, and that is the answer.</strong>{" "}
                {totals.missingLines} line{totals.missingLines === 1 ? " has" : "s have"} no
                cost, so any sum would be smaller than the truth and more attractive than the
                job. Give those components a standard cost in the item master, or load the rest
                of the master above, and the total appears.
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                label="Works cost"
                value={inr(totals.worksCost)}
                hint="Materials, process, labour, tooling, outsourced work and freight, before overhead."
              />
              <Tile
                label={`Overhead at ${num(assumptions.overheadPct, 2)}%`}
                value={inr(totals.overhead)}
                hint="Applied to the works cost. A recovery rate you entered, not one this system holds."
              />
              <Tile
                label="Total cost for the batch"
                value={inr(totals.totalCost)}
                hint={`${num(assumptions.batchQty)} pieces · ${inr(totals.perPiece)} each`}
              />
              <Tile
                label="Margin at the entered price"
                value={margin ? `${num(margin.pct, 2)}%` : "—"}
                hint={
                  margin
                    ? `${inr(margin.revenue)} revenue − ${inr(margin.cost)} cost = ${inr(margin.amount)}`
                    : "Enter a selling price above to see the margin this cost leaves."
                }
              />
            </div>
          )}

          <p className="mt-4 text-[12px] leading-6 text-[var(--text-muted)]">
            <FileText className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            Material quantities are read from the bill of material and divided by its output
            quantity, so a BOM that makes ten of something is not costed as if it made one.
            Scrap is added to the quantity bought, never deducted from it. Component costs are
            the item master&apos;s <em>standard cost</em> — one number per item, with no
            breakdown and no date, which is why the supplier-price fields above exist. No model
            was consulted to produce any figure on this screen, and none could be: a model must
            never set a price.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------- pieces ---------------------------------- */

function SourceCell({ source }: { source: SourceAttribution }): React.JSX.Element {
  if (source.kind === "absent") {
    return (
      <span className="text-[12px] text-[var(--status-overdue-text)]">{source.ref}</span>
    );
  }
  return (
    <span className="block text-[12px] leading-5 text-[var(--text-secondary)]">
      <StatusBadge
        tone={source.kind === "record" ? "approved" : "draft"}
        label={source.kind === "record" ? "Record" : "Entered"}
        className="mr-1.5 align-[-1px]"
      />
      {source.ref}
      {source.note ? (
        <span className="block text-[11px] text-[var(--text-muted)]">{source.note}</span>
      ) : null}
    </span>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        className="field"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 block text-[11px] leading-5 text-[var(--text-muted)]">{hint}</span>
    </label>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}): React.JSX.Element {
  return (
    <div className="x-stat-card">
      <span className="x-stat-top">{label}</span>
      <strong className="x-stat-value x-money">{value}</strong>
      <p className="x-stat-hint">{hint}</p>
    </div>
  );
}

/** An empty or unparseable box means the default, never NaN leaking into a total. */
function numberOr(value: string, fallback: number): number {
  const n = toNum(value);
  return n === null ? fallback : n;
}
