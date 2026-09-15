"use client";

import { useMemo, useState } from "react";
import { Loader2, PackageCheck, Receipt, ShieldQuestion, Truck } from "lucide-react";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Can, useAccess } from "@spine/access/permissions";
import { Empty, ErrorState, FieldError } from "@spine/states";
import { date, dateTime, humanise, inr, num, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  costingApi,
  coverageAge,
  coverageTone,
  EINVOICE_AATO_THRESHOLD_INR,
  EWAY_BILL_THRESHOLD_INR,
  IRN_CANCELLATION_WINDOW_HOURS,
  IRN_REPORTING_WINDOW_DAYS,
  needsEwayBill,
  toNum,
  type CustomerRow,
  type EntitlementResult,
  type SalesOrderSummary,
  type SalesOrderView,
  type SpareRequestRow,
  type TicketQueue,
  type TicketView,
} from "../api";

/**
 * INSTALLED BASE — what we shipped, to whom, and whether it is still covered.
 *
 * This is the join the whole package is built around. A quotation becomes an order, an order
 * becomes a dispatch, a dispatch becomes a machine in somebody's plant, and eighteen months
 * later that machine fails and the only question that matters is whether the repair is ours
 * to pay for. Every one of those facts already exists in this system; none of them were on
 * one screen.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * HOW THIS IS ASSEMBLED, AND THE GAP IT WORKS AROUND. Read this before trusting the screen.
 *
 * THERE IS NO SERIAL REGISTER ENDPOINT IN THIS BUILD. A dispatched sales-order line records a
 * QUANTITY, not a list of serial numbers — `SalesOrderLineView.deliveredQty` is the whole of
 * the shipment evidence. The warranty and AMC tables are keyed by serial and are readable
 * only through the customer PORTAL controller, which needs a portal token this staff session
 * does not have, or through the entitlement check on a ticket.
 *
 * So the installed base here has two halves and they are shown as two halves:
 *
 *   WHAT LEFT THE BUILDING — dispatched order lines, from Sales. Real quantities, real
 *   customer, real dates. No serials.
 *
 *   WHAT THE SERVICE DESK KNOWS ABOUT — the machine serials named on service cases, with the
 *   coverage verdict the entitlement engine reached and the moment it reached it. Real
 *   serials, but only for machines somebody has already raised a case about.
 *
 * They meet at the CUSTOMER: `csp_ticket.customer_account_id` is documented in the schema as
 * a logical reference to the SMBD customer, so the same uuid names the company on both sides.
 * That is a genuine join. What it is not is a complete installed base, and a screen that
 * presented it as one would be inventing the missing half.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * COVERAGE IS NEVER GUESSED. Every verdict on this screen came out of the entitlement engine
 * and is shown with the date it was reached — a verdict without its timestamp cannot be told
 * apart from one computed a year ago against cover that has since run out. Re-running the
 * check is an explicit act behind `csp.ticket.update`, and it is judged on the DATE OF
 * FAILURE rather than on today: a failure inside the cover period stays covered even if the
 * customer reports it three weeks later.
 */
export default function InstalledBaseScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const mayReadTickets = can("csp.ticket.read");
  const mayReadCustomers = can("sales.customer.read");

  const orders = useCursorList<SalesOrderSummary>(costingApi.ordersPath, { limit: 50 });
  const customers = useCursorList<CustomerRow>(
    mayReadCustomers ? costingApi.customersPath : null,
    { limit: costingApi.pageSize },
  );
  const tickets = useQuery<TicketQueue>(mayReadTickets ? costingApi.ticketsPath : null);
  const spares = useQuery<SpareRequestRow[]>(
    mayReadTickets ? costingApi.spareRequestsPath : null,
  );

  const [orderId, setOrderId] = useState("");
  const orderDetail = useQuery<SalesOrderView>(orderId ? costingApi.orderPath(orderId) : null);

  const customerName = useMemo(() => {
    const byId = new Map(customers.rows.map((c) => [c.id, c]));
    return (id: string): string => {
      const found = byId.get(id);
      return found ? `${found.name} · ${found.code}` : "";
    };
  }, [customers.rows]);

  /**
   * One row per machine serial the service desk has seen, newest case first.
   *
   * Grouped in code over the ticket queue rather than fetched: there is no endpoint that
   * lists serials. A serial appearing twice is one machine with two cases, and the most
   * recently CHECKED verdict is the one that governs — not the most recent case, because a
   * newer case may never have had the check run at all.
   */
  const machines = useMemo(() => groupBySerial(tickets.data ?? []), [tickets.data]);

  const orderColumns: ReadonlyArray<Column<SalesOrderSummary>> = [
    {
      key: "soNo",
      header: "Order",
      width: "w-40",
      render: (o) => (
        <button
          type="button"
          className="text-left font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
          onClick={() => setOrderId(o.id)}
          aria-label={`Show what was dispatched on ${o.soNo}`}
        >
          {o.soNo}
        </button>
      ),
    },
    {
      key: "customerName",
      header: "Customer",
      render: (o) => o.customerName ?? "Customer record unavailable",
    },
    {
      key: "orderDate",
      header: "Ordered",
      width: "w-32",
      render: (o) => <span className="text-[var(--text-secondary)]">{date(o.orderDate)}</span>,
    },
    {
      key: "status",
      header: "State",
      width: "w-40",
      render: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: "eway",
      header: "E-way bill",
      width: "w-44",
      render: (o) =>
        needsEwayBill(o.grandTotal) ? (
          <StatusBadge tone="pending" label="Required" />
        ) : (
          <span className="text-[var(--text-muted)]">Below threshold</span>
        ),
    },
    {
      key: "grandTotal",
      header: "Value with GST",
      numeric: true,
      width: "w-40",
      render: (o) => <span className="x-money">{inr(o.grandTotal)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Installed base"
        subtitle="What was shipped, to whom, and whether it is still under warranty or an AMC."
        meta={[
          { label: "Orders", value: num(orders.rows.length) },
          { label: "Machines with a case", value: num(machines.length) },
        ]}
      />

      <div className="x-notice">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          This is assembled from two halves, because there is no serial register in this build:
          a dispatched order line records a <strong>quantity, not serial numbers</strong>, and
          machine serials are only known where somebody has raised a service case. Both halves
          are shown separately below and meet at the customer. Treat the lower table as the
          machines the service desk knows about, not as everything in the field.
        </div>
      </div>

      <h2 className="x-section-heading">What left the building</h2>

      <DataTable
        rows={orders.rows}
        columns={orderColumns}
        loading={orders.loading}
        loadingMore={orders.loadingMore}
        error={orders.error}
        hasMore={orders.hasMore}
        onLoadMore={orders.loadMore}
        onReload={orders.reload}
        rowKey={(o) => o.id}
        caption="Sales orders with customer, date, state, e-way bill requirement and value"
        empty={
          <Empty
            title="No sales order has been raised yet"
            body="An installed base starts with something leaving the building. Raise and dispatch an order in Sales and it appears here, with the delivered quantity per line."
            icon={<Truck />}
          />
        }
      />

      {orderId ? (
        <section className="x-home-panel" aria-labelledby="dispatch-heading">
          <div className="x-home-panel-head flex-wrap gap-3">
            <div>
              <h2 id="dispatch-heading" className="x-section-heading">
                {orderDetail.data ? orderDetail.data.soNo : "Reading the order…"}
              </h2>
              <p>
                Delivered quantity per line is the only shipment evidence this system stores.
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOrderId("")}>
              Close
            </button>
          </div>
          <div className="panel-b flex flex-col gap-4">
            {orderDetail.error ? (
              <ErrorState error={orderDetail.error} onRetry={orderDetail.reload} />
            ) : !orderDetail.data ? (
              <p className="text-[13px] text-[var(--text-secondary)]" role="status">
                Reading the order&apos;s lines…
              </p>
            ) : (
              <DispatchEvidence order={orderDetail.data} />
            )}
          </div>
        </section>
      ) : null}

      <h2 className="x-section-heading">Machines the service desk knows about</h2>

      {!mayReadTickets ? (
        <div className="x-notice" data-tone="warning">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            Serials and coverage come from service cases, which need{" "}
            <code className="font-[var(--font-mono)]">csp.ticket.read</code>. You do not hold
            it, so this half is not shown — rather than shown empty, which would read as
            &ldquo;nothing is in the field&rdquo;.
          </div>
        </div>
      ) : tickets.error ? (
        <ErrorState error={tickets.error} onRetry={tickets.reload} />
      ) : (
        <MachineTable
          machines={machines}
          loading={tickets.loading}
          nameFor={customerName}
          mayNameCustomers={mayReadCustomers}
          onChecked={tickets.reload}
        />
      )}

      <h2 className="x-section-heading">Parts sent out, and who paid for them</h2>

      {!mayReadTickets ? null : spares.error ? (
        <ErrorState error={spares.error} onRetry={spares.reload} />
      ) : (
        <SpareTable rows={spares.data ?? []} loading={spares.loading} />
      )}

      {/* ---------------------------------------------------------------------
          THE STATUTORY NOTE. No data is fetched for it and none could be usefully:
          IRN state lives behind the Integration module's own permissions, not these.
          It is here because the two deadlines below are the ones that cost real money
          on exactly this screen's subject matter, and because a screen that showed an
          IRN field would imply this is where one is generated. It is not.
          --------------------------------------------------------------------- */}
      <section className="card" aria-labelledby="statutory-heading">
        <div className="panel-h">
          <span id="statutory-heading">Two deadlines that attach to a dispatch</span>
          <span className="panel-h-sub">Nothing here is generated or filed by this screen</span>
        </div>
        <div className="panel-b flex flex-col gap-3 text-[12.5px] leading-6 text-[var(--text-secondary)]">
          <p>
            <Truck className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            <strong>E-way bill.</strong> A consignment above{" "}
            {inr(EWAY_BILL_THRESHOLD_INR)} needs one. The table above flags the orders that
            cross it. It says <em>required</em> and never <em>missing</em>: the dispatch
            endpoint accepts and stores an e-way bill number, but no read endpoint in this
            build returns it, so whether one exists is a question this screen honestly cannot
            answer. Check the dispatch record before the vehicle moves.
          </p>
          <p>
            <Receipt className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            <strong>e-invoice and the IRN.</strong> Applicable from{" "}
            {inr(EINVOICE_AATO_THRESHOLD_INR)} aggregate annual turnover. An IRN can be
            cancelled on the portal for {IRN_CANCELLATION_WINDOW_HOURS} hours and never after.
            The reporting window is <strong>{IRN_REPORTING_WINDOW_DAYS} days from the invoice
            date and it is a hard cliff</strong> — past it the portal refuses permanently,
            there is no late window and no appeal, and the only remedy left is a credit note
            and a fresh invoice, which moves your customer&apos;s input credit into another
            month. IRN generation against the IRP is not performed here and this screen shows
            no IRN state; it belongs to the Integration module and its own permissions.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ dispatch evidence ---------------------------- */

function DispatchEvidence({ order }: { order: SalesOrderView }): React.JSX.Element {
  const shipped = order.lines.filter((line) => (toNum(line.deliveredQty) ?? 0) > 0);
  return (
    <>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <Fact label="Customer" value={order.customerName ?? "Record unavailable"} />
        <Fact label="Their PO" value={order.custPoNo} />
        <Fact label="Ordered" value={date(order.orderDate)} />
        <Fact label="Ship-to state" value={order.shipToStateCode} />
        <Fact label="Place of supply" value={order.placeOfSupply} />
        <Fact
          label="Tax"
          value={order.isInterState ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}
        />
        <Fact label="Value with GST" value={inr(order.grandTotal)} />
      </dl>

      {needsEwayBill(order.grandTotal) ? (
        <div className="x-notice" data-tone="warning">
          <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            This consignment is {inr(order.grandTotal)}, above the{" "}
            {inr(EWAY_BILL_THRESHOLD_INR)} e-way bill threshold. The number recorded at
            dispatch is not returned by any read endpoint in this build, so this screen flags
            the requirement and cannot confirm it has been met.
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="grid-table min-w-[44rem]">
          <caption className="sr-only">
            Order lines with ordered and delivered quantity and taxable value
          </caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Ordered</th>
              <th scope="col">Delivered</th>
              <th scope="col">Promised</th>
              <th scope="col" className="text-right!">
                Taxable value
              </th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const ordered = toNum(line.qty) ?? 0;
              const delivered = toNum(line.deliveredQty) ?? 0;
              return (
                <tr key={line.id}>
                  <td>
                    {line.itemCode ?? "Item removed from the master"}
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {line.itemName ?? "No name on the item master"}
                    </div>
                  </td>
                  <td>{qty(ordered, line.uom ?? undefined)}</td>
                  <td>
                    {delivered === 0 ? (
                      <span className="text-[var(--text-muted)]">Nothing shipped</span>
                    ) : (
                      <>
                        {qty(delivered, line.uom ?? undefined)}
                        {delivered + 1e-9 < ordered ? (
                          <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">
                            part-shipped
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td>
                    {line.requestedDeliveryDate ? (
                      date(line.requestedDeliveryDate)
                    ) : (
                      <span className="text-[var(--text-muted)]">No promise recorded</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{inr(line.taxableValue)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] leading-6 text-[var(--text-muted)]">
        {shipped.length === 0
          ? "Nothing on this order has shipped yet, so nothing from it is in the field."
          : `${shipped.length} of ${order.lines.length} line${order.lines.length === 1 ? "" : "s"} have shipped. Which physical machines those became is not recorded — this system stores a delivered quantity, not serial numbers, so the serials below come from service cases rather than from here.`}
      </p>
    </>
  );
}

/* --------------------------- machines and coverage --------------------------- */

interface MachineRow {
  serialNo: string;
  customerAccountId: string;
  /** The most recent case naming this serial. */
  latestTicketNo: string;
  latestAt: string;
  openCases: number;
  totalCases: number;
  /** The verdict from the most recently CHECKED case, with the moment it was reached. */
  verdict: string | null;
  checkedAt: string | null;
  /** The case that verdict came from — so a re-check runs against the right ticket. */
  verdictTicketNo: string;
}

function groupBySerial(tickets: readonly TicketView[]): MachineRow[] {
  const bySerial = new Map<string, MachineRow>();
  for (const ticket of tickets) {
    const serial = ticket.productSerialNo;
    if (!serial) continue;
    const existing = bySerial.get(serial);
    const open = ticket.status !== "closed" && ticket.status !== "resolved" ? 1 : 0;
    if (!existing) {
      bySerial.set(serial, {
        serialNo: serial,
        customerAccountId: ticket.customerAccountId,
        latestTicketNo: ticket.ticketNo,
        latestAt: ticket.createdAt,
        openCases: open,
        totalCases: 1,
        verdict: ticket.entitlement.verdict,
        checkedAt: ticket.entitlement.checkedAt,
        verdictTicketNo: ticket.ticketNo,
      });
      continue;
    }
    existing.totalCases += 1;
    existing.openCases += open;
    if (ticket.createdAt > existing.latestAt) {
      existing.latestAt = ticket.createdAt;
      existing.latestTicketNo = ticket.ticketNo;
    }
    // The governing verdict is the most recently CHECKED one, not the one on the newest
    // case — a newer case may never have had the check run at all, and taking its empty
    // verdict would erase a determination somebody actually made.
    const candidate = ticket.entitlement.checkedAt;
    if (candidate && (!existing.checkedAt || candidate > existing.checkedAt)) {
      existing.checkedAt = candidate;
      existing.verdict = ticket.entitlement.verdict;
      existing.verdictTicketNo = ticket.ticketNo;
    }
  }
  return [...bySerial.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

function MachineTable({
  machines,
  loading,
  nameFor,
  mayNameCustomers,
  onChecked,
}: {
  machines: readonly MachineRow[];
  loading: boolean;
  nameFor: (id: string) => string;
  mayNameCustomers: boolean;
  onChecked: () => void;
}): React.JSX.Element {
  const columns: ReadonlyArray<Column<MachineRow>> = [
    {
      key: "serialNo",
      header: "Machine serial",
      width: "w-52",
      render: (m) => <span className="font-[var(--font-mono)] text-[12px]">{m.serialNo}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (m) => {
        const named = nameFor(m.customerAccountId);
        if (named) return named;
        return (
          <span className="text-[var(--text-muted)]">
            {mayNameCustomers
              ? "Not in the page of the customer master loaded so far"
              : "Naming the customer needs sales.customer.read"}
          </span>
        );
      },
    },
    {
      key: "cases",
      header: "Cases",
      width: "w-36",
      render: (m) => (
        <span className="text-[var(--text-secondary)]">
          {m.openCases > 0 ? `${m.openCases} open of ${m.totalCases}` : `${m.totalCases} closed`}
        </span>
      ),
    },
    {
      key: "coverage",
      header: "Coverage",
      width: "w-56",
      render: (m) => <CoverageCell machine={m} />,
    },
    {
      key: "check",
      header: "",
      width: "w-44",
      render: (m) => <RecheckButton machine={m} onChecked={onChecked} />,
    },
  ];

  return (
    <DataTable
      rows={machines}
      columns={columns}
      loading={loading}
      rowKey={(m) => m.serialNo}
      caption="Machine serials known from service cases, their customer and their coverage verdict"
      empty={
        <Empty
          title="No machine serial is known yet"
          body="Serials reach this system on service cases. Until a customer raises one naming a machine, nothing here knows which physical units are in the field — a dispatched order line records a quantity, not a serial number."
          icon={<PackageCheck />}
        />
      }
    />
  );
}

function CoverageCell({ machine }: { machine: MachineRow }): React.JSX.Element {
  const age = coverageAge(machine.checkedAt);
  if (!machine.verdict) {
    return (
      <span className="text-[12px] text-[var(--status-pending-text)]">
        Never checked — whether a repair is chargeable is unknown
      </span>
    );
  }
  return (
    <span className="block text-[12px] leading-5">
      <StatusBadge tone={coverageTone(machine.verdict)} label={humanise(machine.verdict)} />
      <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
        {age
          ? `Determined ${dateTime(machine.checkedAt)}${age.stale ? ` — ${age.days} days ago, worth re-running` : ""}`
          : "No determination timestamp on record"}
        {` · from ${machine.verdictTicketNo}`}
      </span>
    </span>
  );
}

/**
 * Re-run the warranty and AMC determination.
 *
 * `POST /csp/tickets/:ticketNo/entitlement-check` is a real endpoint behind
 * `csp.ticket.update`, and it does two things: it computes the verdict and it CACHES it on
 * the ticket with the moment it was reached. So this is a write, `<Can>`-gated rather than
 * disabled — a control whose only reachable outcome is a 403 teaches people that this
 * product's buttons are guesses.
 *
 * The date of failure defaults to the ticket's creation date, on the API side, deliberately:
 * a failure inside the cover period stays covered even when it is reported three weeks later,
 * and defaulting to today would quietly deny every late-reported claim.
 */
function RecheckButton({
  machine,
  onChecked,
}: {
  machine: MachineRow;
  onChecked: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EntitlementResult | null>(null);

  async function run(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await api.post<EntitlementResult>(
        costingApi.entitlementCheckPath(machine.latestTicketNo),
      );
      setResult(answer);
      onChecked();
    } catch (e) {
      setError(
        e instanceof AppError
          ? e.message
          : "The coverage check could not be run. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can
      permission="csp.ticket.update"
      fallback={
        <span className="text-[11px] text-[var(--text-muted)]">
          Re-checking needs csp.ticket.update
        </span>
      }
    >
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run()}>
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Checking…
          </>
        ) : (
          "Check coverage"
        )}
      </button>
      {error ? <FieldError message={error} /> : null}
      {result ? (
        <span className="mt-1 block text-[11px] leading-5 text-[var(--text-secondary)]">
          {result.summary}
          {result.partsChargeable ? " Parts are chargeable." : ""}
          {result.anomalies.length > 0
            ? ` ${result.anomalies.length} anomaly flagged for a human — the coverage answer stands on its own merits.`
            : ""}
        </span>
      ) : null}
    </Can>
  );
}

/* --------------------------------- the spares -------------------------------- */

function SpareTable({
  rows,
  loading,
}: {
  rows: readonly SpareRequestRow[];
  loading: boolean;
}): React.JSX.Element {
  const columns: ReadonlyArray<Column<SpareRequestRow>> = [
    { key: "requestNo", header: "Request", width: "w-40", render: (r) => r.requestNo },
    { key: "ticketNo", header: "Case", width: "w-40", render: (r) => r.ticketNo ?? "—" },
    { key: "itemCode", header: "Part", render: (r) => r.itemCode },
    {
      key: "qty",
      header: "Quantity",
      width: "w-32",
      render: (r) => qty(r.qty, r.uom ?? undefined),
    },
    {
      key: "coverage",
      header: "Who pays",
      width: "w-48",
      render: (r) => <StatusBadge tone={coverageTone(r.coverage)} label={humanise(r.coverage)} />,
    },
    { key: "status", header: "State", width: "w-36", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "lineAmount",
      header: "Charged",
      numeric: true,
      width: "w-36",
      render: (r) =>
        r.lineAmount === null ? (
          <span className="text-[var(--text-muted)]">Not priced</span>
        ) : (
          <span className="x-money">{inr(r.lineAmount)}</span>
        ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      loading={loading}
      rowKey={(r) => r.requestNo}
      caption="Spare part requests with the coverage verdict that decided who pays"
      empty={
        <Empty
          title="No spare part has been requested"
          body="A spare request records the part, the case it belongs to and — from the entitlement engine, not from a person's judgement — whether the customer is charged for it."
        />
      }
    />
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-[12.5px] font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
