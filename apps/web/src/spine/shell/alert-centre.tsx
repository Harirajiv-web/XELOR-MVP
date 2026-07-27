"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { api } from "../api/client";
import { useAccess } from "../access/permissions";
import { orderedModules } from "@modules/registry";
import { moduleAvailability, type ModuleAlert } from "../registry/manifest";
import { department } from "../registry/departments";
import { cn } from "../ui/cn";

/**
 * THE THING THAT NOTICES FIRST.
 *
 * A machine stops at 06:12. Today somebody walks to an office and tells somebody else, and
 * the planner who is about to schedule work on that machine finds out at eleven. This panel
 * is the product's answer to that, and it is the answer the whole pitch rests on: the
 * system already knew at 06:12, because the breakdown was recorded, and it can say so to
 * whoever is looking at any screen at all.
 *
 * ----------------------------------------------------------------------------------
 * WHY THIS IS THE AI LAYER AND WHY NO MODEL IS ASKED ANYTHING
 * ----------------------------------------------------------------------------------
 * The AI claim in this product is "evidence-grounded and approval-gated" — it cites the
 * rows it read and it never decides. That is not a slogan we are working around here; it is
 * precisely the design.
 *
 *   THE VERDICT IS ARITHMETIC. "Late" is a promised date compared to today. "Down" is a
 *   breakdown row with no closed-at. "Short" is a reserved quantity against a free one.
 *   Every one of those is computed in a module's own `reduce`, in code, from rows the
 *   viewer's own token was allowed to fetch. A language model is never asked whether
 *   something is a problem, because a model asked to judge will sometimes answer that
 *   everything is fine because the sentence read better — and an alert that is wrong in the
 *   reassuring direction is worse than having no alerts at all.
 *
 *   THE EVIDENCE IS ATTACHED. Every alert names the document it came from. A plant manager
 *   who cannot check a warning in one click will, correctly, stop believing warnings.
 *
 * What is genuinely intelligent here is the WATCHING: nine endpoints across six departments
 * read continuously and folded into one ordered list, deduplicated, ranked and kept quiet
 * once seen. Nobody in a factory does that by hand, and no ERP built as sixteen separate
 * screens can do it either.
 *
 * ----------------------------------------------------------------------------------
 * WHAT KEEPS IT FROM BECOMING NOISE
 * ----------------------------------------------------------------------------------
 * An alert panel has exactly one failure mode, and it is fatal: it cries wolf, gets muted,
 * and then the real fire arrives to a muted panel. Four rules, all structural:
 *
 *   1. PERMISSION FIRST, ALWAYS. A source is not polled unless the viewer holds its
 *      permission. Nobody is warned about something they may not look at.
 *   2. STABLE IDENTITY. An alert's id is the document it concerns, never a timestamp. The
 *      same stopped machine is the same alert on every poll, so "seen" sticks and the bell
 *      stops shouting about a fact you have already read.
 *   3. THREE SEVERITIES, NOT SEVEN. Critical, urgent, attention. A person can hold three.
 *   4. A SOURCE THAT FAILS IS SILENT, NOT LOUD. A dead endpoint must never produce a red
 *      badge — that is how a monitoring system trains people to ignore red.
 */

const SEEN_KEY = "indcore.alerts.seen";
/** Slow on purpose. This runs behind whatever the person is actually doing. */
const POLL_MS = 90_000;

interface Live extends ModuleAlert {
  moduleKey: string;
  moduleName: string;
  departmentCode: string;
}

const RANK: Record<ModuleAlert["severity"], number> = { critical: 0, urgent: 1, attention: 2 };

const LOOK: Record<
  ModuleAlert["severity"],
  { label: string; icon: string; chip: string; dot: string }
> = {
  // "Stopped" was the first word here and it was wrong. Three of the four modules that
  // raise `critical` raise it for a missed statutory deadline or an undelivered filing, not
  // for a halted machine — and a summary chip reading "15 stopped" over a list of e-way
  // bills is the panel telling its own first lie. "Already gone wrong" covers a stopped
  // line and a passed deadline equally, which is what the severity actually means.
  critical: {
    label: "Already gone wrong",
    icon: "OctagonAlert",
    chip: "chip-bad",
    dot: "var(--bad)",
  },
  urgent: {
    label: "Today",
    icon: "TriangleAlert",
    chip: "chip-warn",
    dot: "var(--warn)",
  },
  attention: {
    label: "Worth knowing",
    icon: "Info",
    chip: "chip-info",
    dot: "var(--brand)",
  },
};

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>): void {
  try {
    // Bounded, so a long-running browser profile cannot grow this without limit. The cap is
    // far above the number of distinct problems a plant has in a week.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-400)));
  } catch {
    /* a browser that refuses to remember still works for this session */
  }
}

/** "3 h 20 m ago", from an ISO stamp. Absent or unparseable → nothing, never "Invalid Date". */
function ago(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 0) return null;
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${mins % 60} m ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function AlertCentre(): React.JSX.Element | null {
  const { can, isLicensed, ready } = useAccess();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Live[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [watching, setWatching] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  /**
   * WHAT WAS ALREADY TRUE WHEN THIS TAB OPENED.
   *
   * `null` until the first poll returns, and that distinction is the whole reason this
   * exists. Everything is "new" on the first poll — signing in would throw up nine toasts
   * at once for problems that have been sitting there since Tuesday, and the person would
   * learn, correctly and permanently, that this thing shouts on arrival and can be ignored.
   * A toast is for something that happened WHILE YOU WERE HERE.
   */
  const known = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<Live[]>([]);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  /**
   * Only the sources this viewer is entitled to and this company has licensed. Recomputed
   * when access changes, which is also what stops a source surviving a module being
   * removed: `orderedModules()` is the registry, so a deleted folder takes its watch with
   * it and nothing here needs editing.
   */
  const sources = useMemo(() => {
    if (!ready) return [];
    return orderedModules()
      .filter((m) => moduleAvailability(m, { isLicensed, can }) === null)
      .flatMap((m) =>
        (m.alerts ?? [])
          .filter((s) => can(s.permission))
          .map((s) => ({ m, s })),
      );
  }, [ready, can, isLicensed]);

  const poll = useCallback(async () => {
    if (sources.length === 0) return;

    // One request per endpoint even when two modules watch the same list.
    const inFlight = new Map<string, Promise<unknown>>();
    const fetchOnce = (path: string, query?: Record<string, string | number | boolean>) => {
      const key = `${path}?${JSON.stringify(query ?? {})}`;
      const existing = inFlight.get(key);
      if (existing) return existing;
      const p = api.get<unknown>(path, query ? { query } : undefined);
      inFlight.set(key, p);
      return p;
    };

    const batches = await Promise.all(
      sources.map(async ({ m, s }) => {
        try {
          const data = await fetchOnce(s.path, s.query);
          return s.reduce(data).map(
            (a): Live => ({
              ...a,
              moduleKey: m.key,
              moduleName: m.name,
              departmentCode: m.department,
            }),
          );
        } catch {
          // Deliberately silent. A watch that fails must not turn into a warning — that is
          // how people learn to ignore the colour red.
          return [] as Live[];
        }
      }),
    );

    // Deduplicated by id: two modules can legitimately notice the same fact (a work order
    // blocked for material is Production's problem and Inventory's), and it should reach
    // the reader once, at the higher severity.
    const byId = new Map<string, Live>();
    for (const a of batches.flat()) {
      const prior = byId.get(a.id);
      if (!prior || RANK[a.severity] < RANK[prior.severity]) byId.set(a.id, a);
    }

    const next = [...byId.values()].sort((x, y) => {
      const bySeverity = RANK[x.severity] - RANK[y.severity];
      if (bySeverity !== 0) return bySeverity;
      // Then oldest first: a machine that stopped three hours ago outranks one that stopped
      // ten minutes ago, because the cost has been accruing longer.
      return (Date.parse(x.at ?? "") || 0) - (Date.parse(y.at ?? "") || 0);
    });

    // Anything that appeared while somebody was working, and is bad enough to interrupt
    // them for. `attention` never interrupts — that is what the bell's badge is for.
    if (known.current !== null) {
      const fresh = next.filter(
        (a) => !known.current?.has(a.id) && (a.severity === "critical" || a.severity === "urgent"),
      );
      // Three at once, at most. A machine failure that trips six related alerts must not
      // bury the screen the operator is trying to use to deal with it.
      if (fresh.length > 0) setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 3));
    }
    known.current = new Set(next.map((a) => a.id));

    setAlerts(next);
    setWatching(sources.length);
    setCheckedAt(new Date());
  }, [sources]);

  /**
   * An urgent toast clears itself after twenty seconds. A CRITICAL ONE DOES NOT.
   *
   * A stopped machine is not a notification, it is a fact that stays true until somebody
   * acts on it, and a message that removes itself teaches people that ignoring it makes it
   * go away — which, on this particular class of alert, is precisely the wrong lesson.
   */
  useEffect(() => {
    const timed = toasts.filter((t) => t.severity !== "critical");
    if (timed.length === 0) return;
    const ids = new Set(timed.map((t) => t.id));
    const timer = setTimeout(() => setToasts((cur) => cur.filter((t) => !ids.has(t.id))), 20_000);
    return () => clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    if (sources.length === 0) return;
    let stopped = false;
    const run = (): void => {
      if (!stopped) void poll();
    };
    run();
    const t = setInterval(run, POLL_MS);
    // A tab left open overnight should catch up the moment somebody looks at it again,
    // rather than showing this morning's news until the next ninety-second tick.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll, sources.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unseen = alerts.filter((a) => !seen.has(a.id));
  const worst = unseen[0]?.severity ?? alerts[0]?.severity;
  // The badge counts what has NOT been read. Counting everything would mean the number
  // never falls, and a number that never falls is furniture.
  const count = unseen.length;

  function markAllSeen(): void {
    const next = new Set(seen);
    for (const a of alerts) next.add(a.id);
    setSeen(next);
    writeSeen(next);
  }

  function markSeen(id: string): void {
    const next = new Set(seen);
    next.add(id);
    setSeen(next);
    writeSeen(next);
  }

  // A viewer whose modules declare no watches gets no bell at all, rather than a bell that
  // can never ring. An affordance that is permanently empty is a small lie about the
  // product.
  if (sources.length === 0) return null;

  return (
    <div className="relative" ref={wrap}>
      {/* ------------------------ the ones that interrupt ---------------------- */}
      {toasts.length > 0 ? (
        <div
          // `aria-live="assertive"` because these are only ever critical or urgent. A
          // screen-reader user working in Sales must be told a furnace has stopped without
          // having to go and look, which is the same courtesy the visual toast extends.
          role="alert"
          aria-live="assertive"
          className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[380px] flex-col gap-2.5"
        >
          {toasts.map((a) => {
            const look = LOOK[a.severity];
            const ToastIcon =
              (Icons as unknown as Record<string, Icons.LucideIcon>)[look.icon] ?? Icons.Circle;
            return (
              <div
                key={a.id}
                className="pointer-events-auto overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface)] shadow-[var(--shadow-lg)]"
                style={{
                  borderColor: look.dot,
                  // The severity as a solid edge down the left. Colour alone is never the
                  // signal here — the icon and the word carry it too — but the edge is what
                  // makes a stopped machine distinguishable from a late order across a room.
                  borderLeftWidth: "4px",
                  animation: "ind-toast-in .28s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <div className="flex items-start gap-2.5 px-3.5 py-3">
                  <span
                    className="mt-[1px] grid h-[24px] w-[24px] shrink-0 place-items-center rounded-[7px]"
                    style={{ background: `color-mix(in srgb, ${look.dot} 15%, transparent)` }}
                  >
                    <ToastIcon className="h-4 w-4" style={{ color: look.dot }} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold leading-[1.4] text-[var(--text-primary)]">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                      {a.body}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-secondary)]">
                        {a.moduleName}
                      </span>
                      {a.evidence ? <span className="min-w-0 truncate">· {a.evidence}</span> : null}
                    </p>
                    {a.href ? (
                      <Link
                        href={a.href}
                        onClick={() => {
                          markSeen(a.id);
                          setToasts((t) => t.filter((x) => x.id !== a.id));
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--brand)] hover:underline"
                      >
                        Go and look
                        <Icons.ArrowRight className="h-3 w-3" aria-hidden />
                      </Link>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))}
                    aria-label="Dismiss"
                    className="-mr-1 -mt-1 shrink-0 rounded-[6px] p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
                  >
                    <Icons.X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          count > 0
            ? `Alerts — ${count} you have not read`
            : "Alerts — nothing needs you right now"
        }
        title="Alerts"
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-[9px] transition-colors",
          open
            ? "bg-[var(--brand-soft)] text-[var(--brand)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg)]",
        )}
      >
        <Icons.Bell className="h-4 w-4" aria-hidden />
        {count > 0 ? (
          <span
            // The badge is a NUMBER, not a dot. "Something happened" makes a person open the
            // panel to find out how bad; "7" and a colour lets them decide without moving.
            // It pulses only when something is actually stopped — an animation that is always
            // running stops meaning anything within a day.
            className={cn(
              "absolute -right-0.5 -top-0.5 grid min-w-[17px] place-items-center rounded-full px-[4px] text-[9.5px] font-extrabold leading-[16px] text-white",
              worst === "critical" && "pulse",
            )}
            style={{ background: LOOK[worst ?? "attention"].dot }}
            data-numeric=""
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Alerts"
          className="absolute right-0 top-[calc(100%+6px)] z-50 flex max-h-[min(640px,80vh)] w-[420px] flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
            <Icons.Radar className="h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold leading-tight text-[var(--text-primary)]">
                What needs you
              </p>
              <p className="truncate text-[10.5px] text-[var(--text-muted)]">
                {watching} watch{watching === 1 ? "" : "es"} across your modules
                {checkedAt
                  ? ` · checked ${checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : " · checking…"}
              </p>
            </div>
            {count > 0 ? (
              <button type="button" onClick={markAllSeen} className="btn btn-ghost btn-sm shrink-0">
                Mark all read
              </button>
            ) : null}
          </div>

          {alerts.length > 0 ? (
            <div className="flex shrink-0 gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg)] px-4 py-2">
              {(["critical", "urgent", "attention"] as const).map((s) => {
                const n = alerts.filter((a) => a.severity === s).length;
                if (n === 0) return null;
                return (
                  <span key={s} className={cn("chip", LOOK[s].chip)}>
                    {n} {LOOK[s].label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Icons.CheckCircle2
                  className="mx-auto mb-2.5 h-7 w-7 text-[var(--ok)]"
                  aria-hidden
                />
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                  Nothing needs you right now
                </p>
                <p className="mx-auto mt-1 max-w-[36ch] text-[11.5px] leading-[1.5] text-[var(--text-muted)]">
                  {checkedAt
                    ? "No machine is down, nothing promised today is late, and no order is short of material."
                    : "Reading your modules…"}
                </p>
              </div>
            ) : (
              <ul>
                {alerts.map((a) => {
                  const look = LOOK[a.severity];
                  const AlertIcon =
                    (Icons as unknown as Record<string, Icons.LucideIcon>)[look.icon] ??
                    Icons.Circle;
                  const dept = department(a.departmentCode);
                  const isNew = !seen.has(a.id);
                  const when = ago(a.at);

                  const body = (
                    <>
                      <span className="flex items-start gap-2.5">
                        <span
                          className="mt-[3px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px]"
                          style={{ background: `color-mix(in srgb, ${look.dot} 14%, transparent)` }}
                        >
                          <AlertIcon className="h-3.5 w-3.5" style={{ color: look.dot }} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-1.5">
                            <b className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.4] text-[var(--text-primary)]">
                              {a.title}
                            </b>
                            {isNew ? (
                              <span
                                className="mt-1 h-[6px] w-[6px] shrink-0 rounded-full"
                                style={{ background: look.dot }}
                                aria-label="Not read"
                              />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                            {a.body}
                          </span>
                          {/* THE EVIDENCE. Not decoration and not a debug line — it is the
                              document number a person quotes on the phone, and the reason
                              they will believe the alert above it. */}
                          {a.evidence ? (
                            <span className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-[1.45] text-[var(--text-muted)]">
                              <Icons.FileText className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                              <span className="min-w-0">{a.evidence}</span>
                            </span>
                          ) : null}
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)]">
                            {dept ? (
                              <span
                                className="rounded-[4px] px-1.5 py-[1px] text-[8.5px] font-extrabold tracking-[0.1em] text-white"
                                style={{ background: dept.accent }}
                              >
                                {dept.code}
                              </span>
                            ) : null}
                            <span className="font-semibold text-[var(--text-secondary)]">
                              {a.moduleName}
                            </span>
                            {when ? <span>· {when}</span> : null}
                            {a.href ? (
                              <span className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--brand)]">
                                Open
                                <Icons.ArrowRight className="h-3 w-3" aria-hidden />
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </span>
                    </>
                  );

                  const shell = cn(
                    "block w-full border-b border-[var(--border-subtle)] px-4 py-3 text-left transition-colors last:border-b-0",
                    isNew ? "bg-[var(--surface)]" : "bg-[var(--bg)]",
                    a.href && "hover:bg-[var(--brand-soft-2)]",
                  );

                  return (
                    <li key={a.id}>
                      {/* An alert with somewhere to go is a link; one without is not
                          pretending to be. A row that looks clickable and does nothing is
                          how a person decides a panel is decorative. */}
                      {a.href ? (
                        <Link
                          href={a.href}
                          className={shell}
                          onClick={() => {
                            markSeen(a.id);
                            setOpen(false);
                          }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={shell}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg)] px-4 py-2 text-[10px] leading-[1.45] text-[var(--text-muted)]">
            Each of these was decided by comparing your own records against a date or a
            quantity — never by asking a model. The document behind every line is named
            above it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
