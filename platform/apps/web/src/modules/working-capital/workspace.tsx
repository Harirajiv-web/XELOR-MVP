import { BadgeIndianRupee } from "lucide-react";
import { Empty } from "@spine/states";

/**
 * WORKING CAPITAL — HELD EMPTY UNTIL EVERY FIGURE COMES FROM RECONCILED DATA.
 *
 * Every number this workspace used to show was typed into this file by hand: named
 * customers, invoice references, a thirteen-week cash path, a lender-pack completion
 * percentage. The module makes no API call, so not one of those figures had ever been
 * compared against the tenant's own accounts — and a cash figure that merely LOOKS
 * reconciled is the most expensive kind of wrong, because somebody rings a customer,
 * releases a payment or shows a bank a pack on the strength of it.
 *
 * So the collections below are empty, and each view says so plainly instead of inventing a
 * plausible answer. Before this screen is used for ANY decision — a collection call, a
 * payment run, a stock write-down, a lender pack — its figures must be read from the API
 * (trial balance and posted vouchers, customer invoices and receipts, approved supplier
 * bills, stock valuation, GST returns), carry the as-at date the server used, and be
 * reconciled to the ledger. Populating `figures` or `items` from anything else, a model
 * included, reintroduces exactly the fault this change removed.
 */

export type WorkingCapitalView =
  | "overview"
  | "money-in"
  | "money-out"
  | "stock-cash"
  | "margins"
  | "cash-forecast"
  | "scenarios"
  | "finance-pack";

/** The agent that owns these screens. A statement of its limits, not a figure. */
const owner = {
  code: "RASP",
  name: "Finance Agent",
  purpose:
    "RASP cannot move money. It calculates first, explains the reason, and asks a person before any financial action.",
} as const;

/** One headline figure. Nothing constructs these yet — see the note at the top of this file. */
interface WorkingCapitalFigure {
  label: string;
  value: string;
  note: string;
}

/** One thing a person has to deal with, with the owner and the date it is needed by. */
interface WorkingCapitalItem {
  title: string;
  detail: string;
  owner: string;
  due: string;
}

interface WorkingCapitalPage {
  title: string;
  eyebrow: string;
  description: string;
  /** What this view will show once it reads the ledger. Never a claim about today. */
  emptyBody: string;
  /** Headline figures. Empty by design: this module reads no API. */
  figures: readonly WorkingCapitalFigure[];
  /** Items needing attention. Empty by design, for the same reason. */
  items: readonly WorkingCapitalItem[];
}

/**
 * The records a figure on these screens has to come from. These are SOURCES — where the
 * finance team should expect a number to have been read from — not data, and not a claim
 * that any of them currently holds anything.
 */
const sources = [
  { label: "Accounts", value: "Trial balance and posted vouchers" },
  { label: "Customers", value: "Invoices, receipts and due dates" },
  { label: "Suppliers", value: "Approved bills and payment dates" },
  { label: "Stock", value: "Quantity, age and recorded cost" },
  { label: "Tax", value: "GST returns and ledgers" },
  { label: "Safety", value: "No payment or posting without approval" },
] as const;

const pages: Record<WorkingCapitalView, WorkingCapitalPage> = {
  overview: {
    title: "Working Capital Overview",
    eyebrow: "Finance & working capital",
    description:
      "Know how much cash is available, where it is tied up and what deserves attention today.",
    emptyBody:
      "No cash position has been calculated for this company. Available cash, the cash tied up in customers and stock, and the actions that protect it appear here once vouchers, invoices and stock values are posted and read from the ledger.",
    figures: [],
    items: [],
  },
  "money-in": {
    title: "Money Coming In",
    eyebrow: "Working capital · customer payments",
    description:
      "Focus collection effort on the payments that matter most, without losing the customer context.",
    emptyBody:
      "No customer invoices are recorded, so nothing is expected, due or late. Collection priorities appear here once real invoices and receipts exist to age.",
    figures: [],
    items: [],
  },
  "money-out": {
    title: "Money Going Out",
    eyebrow: "Working capital · supplier payments",
    description:
      "See what must be paid, what can safely wait and where an early-payment benefit is real.",
    emptyBody:
      "No approved supplier bills, payroll or tax commitments are recorded, so there is nothing to schedule or hold. Payment timing appears here once bills are approved and matched to their receipts.",
    figures: [],
    items: [],
  },
  "stock-cash": {
    title: "Stock Holding Cash",
    eyebrow: "Working capital · inventory",
    description: "Find stock that holds too much cash and review it with Stores before buying more.",
    emptyBody:
      "No stock is on hand and nothing is on order, so no cash is tied up in inventory. Slow-moving value and the orders worth reviewing appear here once stock carries a recorded quantity, age and cost.",
    figures: [],
    items: [],
  },
  margins: {
    title: "Margins",
    eyebrow: "Working capital · profitability",
    description:
      "Understand which work creates value and why a margin changed, without reading a technical cost report.",
    emptyBody:
      "Nothing has been dispatched and no job costs are posted, so no margin can be calculated. Margin by order, and the reason it moved, appear here once sales values and recorded material, labour and outside-work costs exist.",
    figures: [],
    items: [],
  },
  "cash-forecast": {
    title: "13-Week Cash Forecast",
    eyebrow: "Working capital · forecast",
    description: "See the likely cash path week by week and understand every assumption behind it.",
    emptyBody:
      "A forecast needs an opening bank position and dated receipts and payments; none are recorded. The weekly path, its lowest point and every assumption behind it appear here once those exist — a forecast built on anything else is a guess wearing a chart.",
    figures: [],
    items: [],
  },
  scenarios: {
    title: "Cash Scenarios",
    eyebrow: "Working capital · what-if planning",
    description:
      "Compare choices safely. A scenario never changes a real invoice, order, payment or stock record.",
    emptyBody:
      "A scenario varies one assumption against a base forecast, and there is no base forecast yet. Comparisons appear here once the cash forecast is calculated from recorded invoices, bills and balances.",
    figures: [],
    items: [],
  },
  "finance-pack": {
    title: "Finance Readiness Pack",
    eyebrow: "Working capital · lender readiness",
    description:
      "Bring the main financial records into one checked list before sharing them with a bank or lender.",
    emptyBody:
      "No accounts, GST filings, bank statements or receivable records have been attached, so the pack is empty rather than partly ready. Each item appears here with its source and review date as it is added, and nothing can be exported until a person has reviewed every gap.",
    figures: [],
    items: [],
  },
};

export function WorkingCapitalWorkspace({ view }: { view: WorkingCapitalView }): React.JSX.Element {
  const page = pages[view];
  const hasContent = page.figures.length > 0 || page.items.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <section
        className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] lg:p-6"
        aria-label={`${page.title} summary`}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {page.eyebrow}
            </p>
            <h1 className="mt-2 text-[24px] font-extrabold tracking-[-0.025em] text-[var(--text-primary)]">
              {page.title}
            </h1>
            <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-[var(--text-secondary)]">
              {page.description}
            </p>
          </div>

          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-[var(--dept-rasp)] text-[var(--text-on-accent)]">
                <BadgeIndianRupee className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Agent owner
                </p>
                <p className="mt-0.5 text-[15px] font-extrabold text-[var(--text-primary)]">
                  {owner.code} · {owner.name}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] leading-5 text-[var(--text-secondary)]">
              {owner.purpose}
            </p>
          </div>
        </div>
      </section>

      {hasContent ? (
        <>
          {page.figures.length > 0 ? (
            <section className="grid gap-3 md:grid-cols-3" aria-label="Key figures">
              {page.figures.map((figure) => (
                <article
                  key={figure.label}
                  className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-[var(--text-muted)]">
                    {figure.label}
                  </p>
                  <p
                    className="mt-3 text-[25px] font-extrabold tracking-[-0.03em] text-[var(--text-primary)]"
                    data-numeric=""
                  >
                    {figure.value}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">
                    {figure.note}
                  </p>
                </article>
              ))}
            </section>
          ) : null}

          {page.items.length > 0 ? (
            <section className="card overflow-hidden" aria-label="What needs attention">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3.5">
                <h2 className="text-[14px] font-extrabold text-[var(--text-primary)]">
                  What needs attention
                </h2>
              </div>
              <ul className="divide-y divide-[var(--border-subtle)]">
                {page.items.map((item) => (
                  <li
                    key={`${item.title}-${item.due}`}
                    className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">
                        {item.detail}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[10.5px] font-semibold text-[var(--text-primary)]">
                        {item.owner}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{item.due}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <section className="card" aria-label="No figures yet">
          <Empty title="No figures to show yet" body={page.emptyBody} />
        </section>
      )}

      <section className="card p-4" aria-label="Where these figures must come from">
        <h2 className="text-[14px] font-extrabold text-[var(--text-primary)]">
          Where these figures must come from
        </h2>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Nothing appears on this screen until it has been read from these records.
        </p>
        <dl className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((source) => (
            <div
              key={source.label}
              className="rounded-[11px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3"
            >
              <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                {source.label}
              </dt>
              <dd className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">
                {source.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
