"use client";

import type { ReactNode } from "react";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { dateTime, humanise, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { Disposition, InspectionReading, InspectionRow } from "../api";
import { qualityApi, readingText, specText } from "../api";

/**
 * ONE INSPECTION — the readings, the specification each was judged against, and what
 * happened to the material afterwards.
 *
 * The design problem on this screen is a single one: A READING OUTSIDE ITS LIMIT MUST BE
 * UNMISSABLE, AND NOT BECAUSE IT IS RED. Roughly one man in twelve on an Indian shop floor
 * cannot separate red from green reliably, this screen is often on a shared machine in mixed
 * light, and a misread here ships a bad part or scraps a good lot. So a failing reading is
 * marked five ways at once, any one of which is sufficient alone:
 *
 *   1. the word OUT OF SPEC, spelled out, not a colour;
 *   2. a warning triangle beside the measurement — a SHAPE, which survives any colour vision;
 *   3. the measurement set in bold where a passing one is not;
 *   4. the specification printed next to it, so the reader can check the call themselves;
 *   5. a deviation column saying how far out and in which direction, in plain words.
 *
 * The limits shown are the APPLIED ones, snapshotted onto the reading when the piece was
 * measured — not today's values from the characteristic master. Revising a drawing tomorrow
 * must not restate what happened today, and showing the current limits beside a historical
 * reading would do precisely that while looking entirely correct.
 */
export default function InspectionScreen(props: ScreenProps): React.JSX.Element {
  const id = props.params[0];
  const { data, loading, error, reload } = useQuery<InspectionRow>(
    id ? qualityApi.inspectionPath(id) : null,
  );

  if (!id) {
    return (
      <Empty
        title="No inspection chosen"
        body="Open an inspection from the list to see its readings and the verdict they produced."
      />
    );
  }
  if (loading) return <Loading label="Loading the inspection…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Empty title="Inspection not found" body="This inspection is no longer readable." />;

  const failing = data.readings.filter((r) => !r.withinSpec).length;
  const rejectedQty = Number(data.qtyRejected ?? "0");
  const dispositioned = data.dispositions.reduce((a, d) => a + Number(d.qty), 0);

  const readingColumns: ReadonlyArray<Column<InspectionReading>> = [
    {
      key: "sampleNo",
      header: "Piece",
      numeric: true,
      width: "w-20",
      render: (r) => r.sampleNo,
    },
    {
      key: "characteristic",
      header: "Characteristic",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            {r.characteristicCode ?? (
              <span className="font-[var(--font-mono)] text-[12px]">{r.characteristicId}</span>
            )}
          </div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {r.characteristicName ?? ""}
            {r.appliedDefectClass ? ` — ${r.appliedDefectClass} defect` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "spec",
      header: "Specification",
      numeric: true,
      width: "w-44",
      // The limits AS APPLIED at the time of measurement, with the characteristic's own
      // unit — a bore is measured in mm on a pump that is sold by the piece.
      render: (r) => (
        <span className="font-[var(--font-mono)] text-[var(--text-secondary)]">
          {specText(r)}
          {r.characteristicUom ? ` ${r.characteristicUom}` : ""}
        </span>
      ),
    },
    {
      key: "reading",
      header: "Measured",
      numeric: true,
      width: "w-44",
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          {!r.withinSpec ? (
            <TriangleAlert
              className="h-3.5 w-3.5 shrink-0 text-[var(--status-rejected-text)]"
              aria-hidden
            />
          ) : null}
          <span
            className={
              r.withinSpec
                ? "font-[var(--font-mono)]"
                : "font-[var(--font-mono)] font-bold text-[var(--status-rejected-text)]"
            }
          >
            {readingText(r)}
            {r.value !== null && r.characteristicUom ? ` ${r.characteristicUom}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "deviation",
      header: "Distance from limit",
      width: "w-52",
      // Spelled out rather than shown as a bare signed number. "+0.04" needs the reader to
      // know which limit it was measured from; "0.04 above the upper limit" does not.
      render: (r) => (
        <span className={r.withinSpec ? "text-[var(--text-secondary)]" : "font-semibold"}>
          {describeDeviation(r)}
        </span>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      width: "w-40",
      render: (r) =>
        r.withinSpec ? (
          <StatusBadge tone="done" label="In spec" />
        ) : (
          <StatusBadge tone="rejected" label="Out of spec" />
        ),
    },
  ];

  const dispositionColumns: ReadonlyArray<Column<Disposition>> = [
    {
      key: "dispositionNo",
      header: "Decision",
      width: "w-40",
      render: (d) => <span className="font-semibold">{d.dispositionNo}</span>,
    },
    {
      key: "dispositionType",
      header: "What was done",
      width: "w-48",
      render: (d) => <StatusBadge status={d.dispositionType} />,
    },
    {
      key: "qty",
      header: "Quantity",
      numeric: true,
      width: "w-32",
      render: (d) => qty(d.qty, data.uom),
    },
    { key: "reason", header: "Why", render: (d) => d.reason },
    {
      key: "moved",
      header: "Stock moved?",
      width: "w-44",
      // The disposition table refuses `executed` without a stock entry, so this is a fact
      // rather than a claim: an entry reference means the material physically moved.
      render: (d) =>
        d.inventoryMovementRef ? (
          <StatusBadge tone="done" label="Moved in stock" />
        ) : (
          <StatusBadge tone="unknown" label="No movement" />
        ),
    },
    {
      key: "decidedAt",
      header: "Decided",
      width: "w-48",
      render: (d) => dateTime(d.decidedAt),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/quality/inspections"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All inspections
      </Link>

      <PageHeader
        title={data.inspectionNo}
        subtitle="Each piece measured, judged against the limits that applied at the moment it was measured. The lot verdict below is arithmetic from these readings — no one typed it in."
        meta={[
          { label: "Readings", value: String(data.readings.length) },
          { label: "Out of spec", value: String(failing) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone="unknown" label={humanise(data.inspectionType)} />
            <StatusBadge status={data.status} />
            <StatusBadge status={data.result} />
          </div>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-4">
        <Fact label="Item">
          {data.itemCode ?? (
            <span className="font-[var(--font-mono)] text-[12px]">{data.itemRef ?? "—"}</span>
          )}
        </Fact>
        <Fact label="Description">{data.itemName ?? "—"}</Fact>
        <Fact label="Raised by">{humanise(data.refType)}</Fact>
        <Fact label="Completed">{data.completedAt ? dateTime(data.completedAt) : "Not yet"}</Fact>
        <Fact label="Lot presented">{qty(data.lotQty, data.uom)}</Fact>
        <Fact label="Pieces to measure">
          {data.sampleSize === null ? "—" : String(data.sampleSize)}
        </Fact>
        <Fact label="Accept on or below">
          {data.acceptNumber === null ? "—" : `${data.acceptNumber} defective`}
        </Fact>
        <Fact label="Reject on or above">
          {data.rejectNumber === null ? "—" : `${data.rejectNumber} defective`}
        </Fact>
        <Fact label="Quantity accepted">{qty(data.qtyAccepted, data.uom)}</Fact>
        <Fact label="Quantity rejected">{qty(data.qtyRejected, data.uom)}</Fact>
        <Fact label="Dispositioned">{qty(dispositioned, data.uom)}</Fact>
        <Fact label="Still undecided">
          {qty(Math.max(rejectedQty - dispositioned, 0), data.uom)}
        </Fact>
      </dl>

      {/* The derivations, in the server's own words. They are stored so an OEM auditor can
          re-check the decision by hand — which only works if the screen actually shows them. */}
      {data.samplingRationale || data.verdictRationale ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[13px] leading-5">
          {data.samplingRationale ? (
            <p>
              <span className="font-semibold text-[var(--text-primary)]">How many were checked: </span>
              <span className="text-[var(--text-secondary)]">{data.samplingRationale}</span>
            </p>
          ) : null}
          {data.verdictRationale ? (
            <p>
              <span className="font-semibold text-[var(--text-primary)]">Why this verdict: </span>
              <span className="text-[var(--text-secondary)]">{data.verdictRationale}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Readings</h2>
        <DataTable
          rows={data.readings}
          columns={readingColumns}
          rowKey={(r) => `${r.characteristicId}-${r.sampleNo}`}
          caption="Every reading taken on this inspection, its specification, and whether it fell inside"
          empty={
            <Empty
              title="No readings recorded yet"
              body="Readings appear here as the inspector measures each piece. The lot cannot be judged until at least one is entered."
            />
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          What happened to the material
        </h2>
        <DataTable
          rows={data.dispositions}
          columns={dispositionColumns}
          rowKey={(d) => d.dispositionNo}
          caption="Disposition decisions taken on this inspection and the stock movements behind them"
          empty={
            <Empty
              title={
                rejectedQty > 0 ? "Rejected, and nothing decided yet" : "Nothing to disposition"
              }
              body={
                rejectedQty > 0
                  ? "This lot was rejected but no one has decided what becomes of it. Until a disposition is recorded the material has not moved anywhere — it is still sitting where it was inspected."
                  : "Nothing on this inspection was rejected, so there is no disposition to record."
              }
            />
          }
        />
      </div>
    </div>
  );
}

/** Words, not a signed number — the sign alone does not say which limit it is measured from. */
function describeDeviation(r: InspectionReading): string {
  if (r.withinSpec) return "Inside the limits";
  const d = Number(r.deviation);
  if (!Number.isFinite(d) || d === 0) {
    // An attribute check fails with no distance to report: the inspector's call IS the fact.
    return "Failed the go / no-go check";
  }
  const size = Math.abs(d).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const unit = r.characteristicUom ? ` ${r.characteristicUom}` : "";
  return d > 0 ? `${size}${unit} above the upper limit` : `${size}${unit} below the lower limit`;
}

/** One labelled fact. Local to this screen — a shared version would be a spine decision. */
function Fact({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="bg-[var(--surface)] px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-[13px] text-[var(--text-primary)]" data-numeric="">
        {children}
      </dd>
    </div>
  );
}
