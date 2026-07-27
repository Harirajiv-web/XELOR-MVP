import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { qty as fmtQty } from "@spine/format";

/* --------------------------- defensive narrowing ---------------------------- */
/**
 * `reduce` is handed `unknown` — what the network actually returned, not what the type says
 * it should have been. Everything below guards every access and returns null on a shape it
 * does not recognise; null drops the tile silently, which is the right outcome for a
 * decorative figure that must never break the page it decorates.
 */

/** Most planning endpoints answer `{ data: [...] }`; a bare array is accepted too. */
function rowsOf(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data === null || typeof data !== "object") return null;
  const envelope = data as { data?: unknown; items?: unknown };
  if (Array.isArray(envelope.data)) return envelope.data;
  if (Array.isArray(envelope.items)) return envelope.items;
  return null;
}

function numberAt(source: unknown, key: string): number | null {
  if (source === null || typeof source !== "object") return null;
  const v = (source as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isPastDue(row: unknown): boolean {
  if (row === null || typeof row !== "object") return false;
  return (row as { pastDue?: unknown }).pastDue === true;
}

/* ---------------------- narrowing, for the alert sources -------------------- */
/**
 * The same discipline as above, but stricter, because an alert is read as a statement of
 * fact about the factory rather than as a decoration. Every field below is one this
 * module's own `api.ts` declares AND the backend genuinely returns — `planned-order.service.ts`
 * `toRow()`, `exception.service.ts` `list()` (which spreads the whole `plan_exception` row),
 * and `mrp.service.ts` `latestRun()` (which spreads the whole `mrp_run` row).
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Tolerates `{ data }`, `{ items }` and a bare array, because a watch is not the place to discover an envelope change. */
function recordsOf(data: unknown): readonly Record<string, unknown>[] {
  let list: unknown = data;
  if (isRecord(data)) list = data["data"] ?? data["items"];
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord);
}

function textOf(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* -------------------------- dates, done by arithmetic ----------------------- */
/**
 * THE VERDICT IS ARITHMETIC AND THE CLOCK IS THE READER'S OWN.
 *
 * Every "late" below is a stored date compared with the date on the machine the planner is
 * sitting at. No demo date is hard-coded, and no model is asked whether something is late —
 * DECISIONS-V2 §4: AI explains, never decides.
 */

/** The viewer's LOCAL calendar date. A plant on IST at 02:00 is still working yesterday in UTC. */
function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Whole days from one calendar date to another, positive when `to` is later.
 *
 * Both ends are parsed at UTC midnight on purpose: a difference taken between two local
 * timestamps drifts by an hour across a clock change and can round to the wrong day, which
 * on this screen would be the difference between "due today" and "one day late".
 */
function daysBetween(fromISO: string, toISO: string): number | null {
  const a = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-07-20` → `20-Jul-2026`. §7's date format, so evidence reads the way a document does. */
function dmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}-${MONTHS[Number(mo) - 1] ?? mo}-${y}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * At most eight, worst first, and never a silent truncation.
 *
 * A bell that quietly shows eight of forty teaches a planner that eight is all there is, and
 * the thirty-two it dropped are the ones that surface as a stopped line. When the list is
 * cut, the cut itself becomes the last alert.
 */
const ALERT_CAP = 8;

function capped(
  ranked: readonly ModuleAlert[],
  total: number,
  summary: (shown: number, total: number) => ModuleAlert,
): readonly ModuleAlert[] {
  if (total <= ALERT_CAP) return ranked.slice(0, ALERT_CAP);
  return [...ranked.slice(0, ALERT_CAP), summary(ALERT_CAP, total)];
}

/**
 * How old a plan is allowed to be before its age is itself worth saying.
 *
 * Seven days, because the horizon is bucketed in weeks: once a run is a week old its first
 * bucket is no longer the current week, and every bucket label in Planned orders and
 * Exceptions is describing a week that has moved. That is the point at which a figure quoted
 * off the plan starts to be confidently wrong rather than merely old.
 */
const PLAN_STALE_DAYS = 7;
const PLAN_VERY_STALE_DAYS = 14;

/**
 * Severity, worst first — the order a planner reads a worklist in, and the same order the
 * Exceptions screen uses. Fixed rather than derived from the payload's keys so the chart
 * does not silently re-order itself between two runs of the same factory.
 */
const SEVERITIES = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
] as const;

/**
 * PLANNING / MRP (AXLE, Module 13).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * READ-ONLY, on purpose, in this pass. Running MRP, firming an order and converting one are
 * consequential acts — they commit labour or ask a supplier for a price — and they belong
 * behind an approval gate, not behind a button somebody finds by accident while looking at a
 * list.
 */
export const planningManifest: ModuleManifest = {
  key: "planning",
  name: "Planning",
  summary: "What to make, what to buy and by when — with the arithmetic kept.",
  department: "AXLE",
  icon: "CalendarRange",
  licenceKey: "planning",
  order: 35,
  nav: [
    {
      label: "MRP run",
      path: "mrp",
      permission: "planning.mrp.read",
      icon: "Calculator",
      description:
        "The receipt for the last MRP run: when it was worked out, the date it was worked out AS OF, the weeks it covered, what went into it, and how many items, planned orders and exceptions came out. Every figure is read back from the run's own record — nothing here is recalculated, so it tells you how old the plan is before you act on anything downstream of it. This screen does not start a run.",
    },
    {
      label: "Planned orders",
      path: "planned-orders",
      permission: "planning.mrp.read",
      icon: "ClipboardList",
      description:
        "What the last MRP run worked out should be made or bought, the date each one has to START, and the date the material is wanted. These are SUGGESTIONS and nothing more — no supplier has been contacted, no work has been released to the floor, and no button on this screen does either. Click any row for the week-by-week working behind the quantity.",
    },
    {
      label: "Exceptions",
      path: "exceptions",
      permission: "planning.mrp.read",
      icon: "TriangleAlert",
      description:
        "The short list, out of the whole plan, of things that go wrong unless somebody acts — each with what happened, what to do about it, the item, and the document it concerns. Written by the last MRP run in full sentences, worst first; the headline and the counts come from the same run as the rows, so they cannot disagree. Nothing here can be accepted, snoozed or closed yet.",
    },
    {
      label: "Demand",
      path: "demand",
      permission: "planning.demand.read",
      icon: "TrendingUp",
      description:
        "What the factory has been asked for, item by item and week by week, over 6, 13 or 26 weeks. The large figure in each cell is the NET demand MRP will actually explode — a confirmed sales order eats into the forecast that predicted it rather than adding to it — with the order quantity and the surviving forecast in small type beneath. An item with no planning policy is never planned and so never appears here.",
    },
    {
      label: "Planning policies",
      path: "policies",
      permission: "planning.policy.read",
      icon: "SlidersHorizontal",
      description:
        "How each item is replenished: its level in the bill of materials, what triggers an order, the lot rule and lot size, the lead time in WORKING days, safety stock, reorder point, ABC class and whether it is master-scheduled. Almost every quantity in a plan that looks wrong is explained by a row on this page. Read-only in this pass — nothing here changes a policy.",
    },
    {
      // The payoff screen, reached by clicking a planned order rather than from the sidebar:
      // it is always about one item in one run, and a sidebar entry would open it with
      // nothing to explain. /planning/explain/<runNo>/<itemCode>.
      label: "Why this order",
      path: "explain",
      permission: "planning.mrp.read",
      icon: "Microscope",
      hidden: true,
      // Not checked by `module-check` — hidden entries are exempt — but the route draws the
      // band for it, and this is the screen the whole module is defending, so it says its piece.
      description:
        "The working the MRP run kept for one item: week by week, what was wanted, what was already coming, what was on hand, and the shortfall that produced each planned order — as a table and again in the run's own words. It is read back from the run and never recalculated, so it cannot disagree with the order it explains. Reached by clicking a row in Planned orders; it needs a run number and an item code in the address.",
    },
  ],
  screens: {
    mrp: () => import("./screens/mrp"),
    // Quoted because a hyphen is not legal in an unquoted object key. The URL segment is the
    // product decision — "planned-orders" is what a planner reads in the address bar — so the
    // key follows it rather than the other way round.
    "planned-orders": () => import("./screens/planned-orders"),
    exceptions: () => import("./screens/exceptions"),
    demand: () => import("./screens/demand"),
    policies: () => import("./screens/policies"),
    explain: () => import("./screens/explain"),
  },
  /**
   * WHAT THE PLAN SAYS, AND WHAT IS WRONG WITH IT.
   *
   * Those are the two questions a planner opens this module with, in that order, so they are
   * the two figures the department dashboard carries — plus the run they both came from, so
   * a reader can tell at a glance whether they are looking at this morning's plan or at one
   * computed a fortnight ago. A count with no run behind it is a number nobody can check.
   *
   * The severity breakdown is a chart on purpose. An exception is a message to a person, and
   * how many of them are shouting is the single most actionable shape in the whole plan: two
   * criticals is a phone call this afternoon, forty is a plan that needs re-cutting. All four
   * buckets are shown even when empty, because "nothing is critical" is information a planner
   * wants stated rather than inferred from an absent row.
   *
   * Every path here is one the module's own screens already call, and every request is a GET.
   * Planning reads; it never writes stock and it does not write anything from a dashboard.
   */
  signals: [
    {
      label: "Planned orders",
      permission: "planning.mrp.read",
      path: "/planning/planned-orders",
      reduce: (data): SignalValue | null => {
        const rows = rowsOf(data);
        if (!rows) return null;
        // `pastDue` means the lead time wanted this order released in a week that has
        // already gone — a fact about physics, and the one thing on this list that cannot be
        // fixed by working faster later.
        const late = rows.filter(isPastDue).length;
        return {
          value: String(rows.length),
          hint:
            rows.length === 0
              ? "nothing short across the horizon"
              : late > 0
                ? `${late} already past the date they had to start`
                : "none past their release date",
          tone: late > 0 ? "warn" : rows.length === 0 ? "ok" : "neutral",
        };
      },
    },
    {
      label: "Open exceptions",
      permission: "planning.mrp.read",
      path: "/planning/exceptions/summary",
      reduce: (data): SignalValue | null => {
        const open = numberAt(data, "openCount");
        if (open === null) return null;
        const bySeverity = (data as { bySeverity?: unknown }).bySeverity;
        const series = SEVERITIES.map((s) => ({
          label: s.label,
          value: numberAt(bySeverity, s.key) ?? 0,
        }));
        const critical = series.find((s) => s.label === "Critical")?.value ?? 0;
        const high = series.find((s) => s.label === "High")?.value ?? 0;
        const total = series.reduce((n, s) => n + s.value, 0);
        return {
          value: String(open),
          hint: open === 0 ? "the plan is clean" : "need a decision",
          tone: critical > 0 ? "bad" : high > 0 ? "warn" : open > 0 ? "neutral" : "ok",
          // Four empty bars say nothing worth the space they take. When there is nothing to
          // break down, the tile falls back to the plain figure on its own.
          ...(total > 0 ? { series } : {}),
        };
      },
    },
    {
      label: "Items planned",
      permission: "planning.mrp.read",
      path: "/planning/mrp/runs/latest",
      reduce: (data): SignalValue | null => {
        // Null is an ANSWER from this endpoint, not a failure: it means MRP has never been
        // run here. There is no figure to show for that, so there is no tile.
        const items = numberAt(data, "itemCount");
        if (items === null) return null;
        const runNo = (data as { runNo?: unknown }).runNo;
        const status = (data as { status?: unknown }).status;
        const label = typeof runNo === "string" && runNo ? runNo : "the latest run";
        const failed = typeof status === "string" && status !== "completed";
        return {
          value: String(items),
          hint: failed ? `${label} — ${String(status)}` : `explained item by item in ${label}`,
          tone: failed ? "bad" : "neutral",
        };
      },
    },
  ],

  /* ==========================================================================
     WHAT PLANNING INTERRUPTS SOMEBODY FOR.
     ==========================================================================

     Three watches, and the third one exists to keep the first two honest.

     AN MRP EXCEPTION IS ONLY AS FRESH AS THE RUN THAT WROTE IT. Nothing in this module is
     live: a planned order and an exception are both rows a run produced at a moment in time
     and never touched again. Quoting one as though it were today's news is the single most
     destructive thing a planning system can do, because it is wrong in the reassuring
     direction — the planner believes the plan has been consulted when it has not.

     So every alert below carries the date its row was written, in `evidence` and in `at`,
     and the third source watches the plan's own age and says so out loud when the run is
     more than a week old. A number is allowed to be old. It is not allowed to be old and
     silent about it.

     Every verdict here is a subtraction between two dates or a read of a column the run
     already wrote. No model is consulted — DECISIONS-V2 §4.
     ========================================================================== */
  alerts: [
    /* ---------------------------------------------------------------------
       1. THE ORDERS THE CALENDAR OVERTOOK AFTER THE PLAN WAS MADE.
       ---------------------------------------------------------------------
       `GET /planning/planned-orders` answers `{ data: [...] }` for the LATEST run, and each
       row carries `releaseDate` — the day the order has to start — plus `pastDue`, the run's
       own verdict about that date on the day the run was made.

       This watch deliberately looks at the rows where `pastDue` is FALSE: orders the run
       considered comfortably in hand, whose release date has since gone past without
       anybody releasing them. Those are invisible everywhere else in the product. The ones
       the run already flagged `pastDue` are left alone here because the run raised a
       `past_due` EXCEPTION for each of them, with a better message and a suggestion, and
       watch 2 below carries those — two alerts for one casting is how a bell gets muted.

       The verdict: `daysBetween(row.releaseDate, today) >= 1`, with today read off the
       viewer's own clock, and `status` still `planned` or `firmed`. A converted or cancelled
       order is somebody else's document now.
       --------------------------------------------------------------------- */
    {
      permission: "planning.mrp.read",
      path: "/planning/planned-orders",
      reduce: (data): readonly ModuleAlert[] => {
        const today = todayISO();
        const late: { alert: ModuleAlert; days: number }[] = [];

        for (const row of recordsOf(data)) {
          const status = textOf(row, "status");
          // Converted and cancelled orders are settled. Planned and firmed are not.
          if (status !== "planned" && status !== "firmed") continue;
          // The run's own past-due orders belong to watch 2, as exceptions.
          if (row["pastDue"] === true) continue;

          const releaseDate = textOf(row, "releaseDate");
          const orderKey = textOf(row, "orderKey");
          const itemCode = textOf(row, "itemCode");
          if (!releaseDate || !orderKey || !itemCode) continue;

          const days = daysBetween(releaseDate, today);
          if (days === null || days < 1) continue;

          const isBuy = textOf(row, "sourceType") === "buy";
          // Straight off a NUMERIC column this arrives as "11.000", and "11.000 castings" reads as
          // false precision on a count of things you can hold. `fmtQty` drops the trailing zeros
          // and groups Indian-style, the same as every quantity elsewhere in the product.
          const raw = textOf(row, "qty");
          const quantity = raw === null ? "" : fmtQty(raw);
          const wantedBy = textOf(row, "needDate");
          const receiptBucket = textOf(row, "receiptBucket");

          late.push({
            days,
            alert: {
              // ITEM@BUCKET. Deterministic within a run and the same string in the next run
              // for the same shortage, so "I have seen this" survives both a poll and a replan.
              id: `planning.planned-order.overtaken:${orderKey}`,
              // Five working days is a week of the horizon gone. Below that it is a day or
              // two of slack somebody can still make up.
              severity: days >= 5 ? "critical" : "urgent",
              title: `${quantity ? `${quantity} ` : ""}${itemCode} should have been ${isBuy ? "ordered" : "started"} ${plural(days, "day", "days")} ago.`,
              body: wantedBy
                ? `The plan gave it a start date of ${dmy(releaseDate)} and it has not been ${isBuy ? "raised as a requisition" : "released to the floor"}. It is wanted by ${dmy(wantedBy)}${receiptBucket ? ` (${receiptBucket})` : ""}, and every day it waits comes off that.`
                : `The plan gave it a start date of ${dmy(releaseDate)} and it has not been ${isBuy ? "raised as a requisition" : "released to the floor"}.`,
              href: "/planning/planned-orders",
              // The event is the day the start date passed, not the moment of the poll.
              at: `${releaseDate.slice(0, 10)}T00:00:00Z`,
              evidence: `Planned order ${orderKey} from the latest MRP run — start by ${dmy(releaseDate)}, status ${status}. The run itself did not call this late; the calendar has moved since.`,
            },
          });
        }

        // Longest overdue first: the cost has been accruing longest on that one.
        late.sort((a, b) => b.days - a.days);
        return capped(
          late.map((l) => l.alert),
          late.length,
          (shown, total) => ({
            id: "planning.planned-order.overtaken:more",
            severity: "attention",
            title: `${total} planned orders are past the date they had to start.`,
            body: `The ${shown} furthest behind are listed above. Open Planned orders for the rest — the list is sorted by release date.`,
            href: "/planning/planned-orders",
            evidence: `${total} rows in the latest MRP run's planned orders with a start date before ${dmy(today)} and a status of planned or firmed.`,
          }),
        );
      },
    },

    /* ---------------------------------------------------------------------
       2. THE EXCEPTIONS THE RUN ITSELF RAISED AND NOBODY HAS ANSWERED.
       ---------------------------------------------------------------------
       `GET /planning/exceptions?status=open` answers `{ data: [...] }`, where each row is
       the whole `plan_exception` record — `severity`, `exceptionType`, `itemCode`, `ref`,
       `message`, `suggestion`, `pegRef`, `createdAt`. `createdAt` is stamped when the RUN
       wrote the row, which is what makes the freshness statement below true rather than
       decorative.

       The verdict is a read, not a judgement: `severity === "critical"` or `"high"`, a
       column the MRP engine computed from how late the order is, the item's ABC class and
       whether a customer's sales order is pegged to it. `medium` and `low` are left off the
       bell entirely — they are a worklist, not an interruption.
       --------------------------------------------------------------------- */
    {
      permission: "planning.mrp.read",
      path: "/planning/exceptions",
      query: { status: "open" },
      reduce: (data): readonly ModuleAlert[] => {
        const today = todayISO();
        const rows = recordsOf(data);
        const openTotal = rows.length;

        const worth = rows.filter((r) => {
          const sev = textOf(r, "severity");
          return sev === "critical" || sev === "high";
        });

        const ranked = [...worth].sort((a, b) => {
          const rank = (r: Record<string, unknown>): number =>
            textOf(r, "severity") === "critical" ? 0 : 1;
          const bySeverity = rank(a) - rank(b);
          if (bySeverity !== 0) return bySeverity;
          return (textOf(a, "itemCode") ?? "").localeCompare(textOf(b, "itemCode") ?? "");
        });

        const alerts: ModuleAlert[] = [];
        for (const r of ranked) {
          const ref = textOf(r, "ref");
          const type = textOf(r, "exceptionType");
          const message = textOf(r, "message");
          const itemCode = textOf(r, "itemCode");
          if (!ref || !type || !message || !itemCode) continue;

          const raisedAt = textOf(r, "createdAt");
          const raisedDay = raisedAt ? raisedAt.slice(0, 10) : null;
          const planAge = raisedDay ? daysBetween(raisedDay, today) : null;

          alerts.push({
            // Type plus the document it is about. Both survive a replan — the next run
            // raises the same type against the same order key for the same problem — where
            // the row's own uuid would be brand new every night and re-announce a casting
            // the planner read yesterday.
            id: `planning.exception:${type}:${ref}`,
            severity: textOf(r, "severity") === "critical" ? "critical" : "urgent",
            title: message,
            body: textOf(r, "suggestion") ?? "Open the exception worklist to see what the run suggests.",
            href: "/planning/exceptions",
            // The moment the RUN raised it. Never the moment of the poll — an exception
            // stamped "just now" every ninety seconds would be a lie told on a timer.
            ...(raisedAt ? { at: raisedAt } : {}),
            evidence: raisedDay
              ? `${type.replace(/_/g, " ")} on ${itemCode}, reference ${ref}${textOf(r, "pegRef") ? `, caused by ${textOf(r, "pegRef")}` : ""} — raised by the MRP run on ${dmy(raisedDay)}${planAge !== null && planAge > 0 ? `, ${plural(planAge, "day", "days")} ago` : ""}. It reflects the factory as the plan saw it that day, not as it stands now.`
              : `${type.replace(/_/g, " ")} on ${itemCode}, reference ${ref}, from the latest MRP run.`,
          });
        }

        const newest = alerts.find((a) => a.at !== undefined)?.at;
        return capped(alerts, alerts.length, (shown, total) => ({
          id: "planning.exception:more",
          severity: "attention",
          title: `${total} planning exceptions need a decision — the ${shown} worst are listed above.`,
          body: `${openTotal} exceptions are open in the latest run in total, counting the medium and low ones the bell does not raise. The worklist is sorted worst first.`,
          href: "/planning/exceptions",
          ...(newest ? { at: newest } : {}),
          evidence: `${total} open exceptions at critical or high severity in the latest MRP run.`,
        }));
      },
    },

    /* ---------------------------------------------------------------------
       3. THE PLAN'S OWN AGE, AND WHETHER IT FINISHED.
       ---------------------------------------------------------------------
       This is the watch that makes the other two safe to believe.

       `GET /planning/mrp/runs/latest` answers the whole `mrp_run` row, or `null` when MRP
       has never been run here — and null is an ANSWER, not a failure, so it produces no
       alert. `planningDate` is the date the plan was computed AS OF; `status` is
       `completed`, `running` or `failed`.

       Two verdicts, both arithmetic:
         - `status !== "completed"` → the plan is not a plan. Critical, because every planned
           order and every exception elsewhere in this module is being read off a run that
           did not finish, and nothing on those screens says so.
         - `daysBetween(planningDate, today) >= 7` → the plan is at least a bucket old. The
           week labels in Planned orders and Exceptions no longer mean the week the reader
           thinks they mean.
       --------------------------------------------------------------------- */
    {
      permission: "planning.mrp.read",
      path: "/planning/mrp/runs/latest",
      reduce: (data): readonly ModuleAlert[] => {
        if (!isRecord(data)) return [];
        const runNo = textOf(data, "runNo");
        const status = textOf(data, "status");
        const planningDate = textOf(data, "planningDate");
        if (!runNo || !status || !planningDate) return [];

        const ranAt = textOf(data, "createdAt");
        const asOf = dmy(planningDate);

        if (status !== "completed") {
          return [
            {
              id: `planning.mrp.run.incomplete:${runNo}`,
              severity: "critical",
              title: `MRP run ${runNo} is ${status}, not completed.`,
              body:
                (textOf(data, "failureReason") ??
                  "Planned orders and exceptions elsewhere in Planning are being read off this run.") +
                " Nothing downstream of it should be acted on until a run finishes.",
              href: "/planning/mrp",
              ...(ranAt ? { at: ranAt } : {}),
              evidence: `MRP run ${runNo}, planned as of ${asOf}, status ${status}.`,
            },
          ];
        }

        const age = daysBetween(planningDate, todayISO());
        if (age === null || age < PLAN_STALE_DAYS) return [];

        return [
          {
            // The run number, so the alert stops the moment a fresh run replaces it rather
            // than following the plan around.
            id: `planning.mrp.run.stale:${runNo}`,
            severity: age >= PLAN_VERY_STALE_DAYS ? "urgent" : "attention",
            title: `The plan is ${plural(age, "day", "days")} old — it was worked out as of ${asOf}.`,
            body: `Planned orders, exceptions and every weekly bucket label in Planning come from this run. Sales orders confirmed, stock received and work finished since ${asOf} are not in it. Re-run MRP before committing to anything off those screens.`,
            href: "/planning/mrp",
            // The event is the run, not the poll.
            ...(ranAt ? { at: ranAt } : { at: `${planningDate.slice(0, 10)}T00:00:00Z` }),
            evidence: `MRP run ${runNo}, planning date ${asOf}, ${plural(Number(data["plannedOrderCount"] ?? 0), "planned order", "planned orders")} and ${plural(Number(data["exceptionCount"] ?? 0), "exception", "exceptions")} still being served from it.`,
          },
        ];
      },
    },
  ],
};
