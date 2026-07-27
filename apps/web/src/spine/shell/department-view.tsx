"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { api } from "../api/client";
import { useAccess } from "../access/permissions";
import {
  department,
  installedByDepartment,
  blueprintStatus,
  DEPARTMENTS,
  type Department,
} from "../registry/departments";
import { AgentBrain, type BrainCore, type BrainNode } from "./agent-brain";
import { visibleNav, type ModuleManifest, type SignalValue } from "../registry/manifest";
import { CountUp, Meter, Reveal } from "../ui/motion";
import { BarRows, Donut } from "../ui/charts";
import { Loading } from "../states";
import { cn } from "../ui/cn";

/**
 * A DEPARTMENT, AS A DASHBOARD.
 *
 * Clicking HEXA in the sidebar should not open a list of links — it should answer "what
 * does this part of the system own, and how is it doing right now". So each module under
 * the department gets a card carrying live figures the module itself declared, and the
 * page above them summarises the department: how many modules, how many screens, how much
 * of its specification actually shipped.
 *
 * WHY THE NUMBERS COME FROM THE MODULES. The spine has no table of endpoints. Each module
 * declares its own `signals` in its manifest, and this page renders whatever it is handed.
 * Delete a module folder and its card, its figures and its endpoints all leave with it —
 * which is the only version of "removable" worth claiming.
 *
 * Every tile is permission-checked BEFORE its request is made, so a viewer never sees an
 * empty card for something they cannot open, and the console never fills with 403s.
 */

interface Loaded {
  moduleKey: string;
  label: string;
  value: SignalValue;
}

export function DepartmentView({ code }: { code: string }): React.JSX.Element {
  const { can, isLicensed, ready } = useAccess();
  const dept = department(code.toUpperCase());
  const group = installedByDepartment().find((g) => g.department.code === code.toUpperCase());

  const [signals, setSignals] = useState<Loaded[]>([]);
  const [busy, setBusy] = useState(true);

  const modules = (group?.modules ?? []).filter(
    (m) => isLicensed(m.licenceKey) && visibleNav(m, can).length > 0,
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setBusy(true);

    const wanted = modules.flatMap((m) =>
      (m.signals ?? [])
        // Checked BEFORE fetching. A tile the viewer may not see costs no request.
        .filter((s) => can(s.permission))
        .map((s) => ({ m, s })),
    );

    // ONE REQUEST PER ENDPOINT, not one per tile. Several modules quite reasonably draw two
    // figures from the same list — "items" and "items that are manufactured" both come from
    // `/engineering/items` — and firing that twice would double the load for no new data.
    // Signals stay independent; only the fetch is shared.
    const inFlight = new Map<string, Promise<unknown>>();
    const fetchOnce = (path: string, query?: Record<string, string | number | boolean>) => {
      const key = `${path}?${JSON.stringify(query ?? {})}`;
      const existing = inFlight.get(key);
      if (existing) return existing;
      const p = api.get<unknown>(path, query ? { query } : undefined);
      inFlight.set(key, p);
      return p;
    };

    void Promise.all(
      wanted.map(async ({ m, s }) => {
        try {
          const data = await fetchOnce(s.path, s.query);
          const value = s.reduce(data);
          return value ? { moduleKey: m.key, label: s.label, value } : null;
        } catch {
          // A decorative tile must never be able to break the page it decorates. A signal
          // that fails — or a `reduce` that throws on a shape it did not expect — is simply
          // absent, and the module card still renders with its screens.
          return null;
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        setSignals(results.filter((r): r is Loaded => r !== null));
        setBusy(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, ready]);

  if (!dept) {
    return (
      <p className="py-16 text-center text-[13px] text-[var(--text-muted)]">
        No department is registered under the code “{code}”.
      </p>
    );
  }

  const screens = modules.reduce((n, m) => n + visibleNav(m, can).length, 0);
  const shipped = dept.blueprints.filter((b) => blueprintStatus(b) === "installed").length;

  const Icon =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[dept.icon] ?? Icons.Circle;

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------- the department ---------------------------- */}
      <Reveal>
        <header className="flex flex-wrap items-start gap-4">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] text-white"
            style={{ background: dept.accent }}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span
                className="rounded-[6px] px-2 py-1 text-[11px] font-extrabold tracking-[0.12em] text-white"
                style={{ background: dept.accent }}
              >
                {dept.code}
              </span>
              <h1 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">
                {dept.name}
              </h1>
              {dept.component ? (
                <span className="chip chip-violet">Component, not a department</span>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">
                System of record for:{" "}
              </span>
              {dept.owns}
            </p>
          </div>
        </header>
      </Reveal>

      {/* ------------------------------ the summary ----------------------------- */}
      <div className="kgrid">
        {[
          {
            l: "Modules",
            v: String(modules.length),
            d: modules.map((m) => m.name).join(" · ") || "None available to you",
          },
          { l: "Screens", v: String(screens), d: "That you can open" },
          {
            l: "Specified",
            v: `${shipped}/${dept.blueprints.length}`,
            d: "Blueprints that shipped as a module in this build",
            f: dept.blueprints.length ? shipped / dept.blueprints.length : 0,
          },
          {
            l: "Live figures",
            v: String(signals.length),
            d: "Read from this department's own endpoints",
          },
        ].map((k, i) => (
          <Reveal key={k.l} delay={60 + i * 55}>
            <div className="kpi h-full">
              <p className="kpi-l">{k.l}</p>
              <p className="kpi-v">
                <CountUp value={k.v} />
              </p>
              {k.f !== undefined ? <Meter fraction={k.f} className="mt-2" /> : null}
              <p className="kpi-d truncate" title={k.d}>
                {k.d}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* ------------------------------- the brain ------------------------------ */}
      {/* ONYX is the only department whose satellites are OTHER DEPARTMENTS — it is the
          brain, and the six agents are what it reasons across. Every other department puts
          its own modules on the ring, in the same shape, so a reader who learned the picture
          on ONYX can already read HEXA's. */}
      <Reveal delay={150}>
        <AgentBrain
          core={coreOf(dept, modules.length, screens)}
          satellites={
            dept.code === "ONYX"
              ? DEPARTMENTS.filter((d) => d.code !== "ONYX").map(departmentNode)
              : modules.map((m, i) => moduleNode(m, dept, i, modules.length, can))
          }
          mapTitle={dept.code === "ONYX" ? "Agent map" : `Inside ${dept.code}`}
        />
      </Reveal>

      {/* ------------------------------ the modules ----------------------------- */}
      {busy ? (
        <Loading label="Reading this department's figures…" />
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {modules.map((m, i) => (
            <Reveal key={m.key} delay={200 + i * 60}>
              <ModuleCard
                module={m}
                accent={dept.accent}
                signals={signals.filter((s) => s.moduleKey === m.key)}
                can={can}
              />
            </Reveal>
          ))}
        </div>
      )}

      {modules.length === 0 && !busy ? (
        <p className="card p-10 text-center text-[13px] text-[var(--text-muted)]">
          No module from this department is available to you. That is either a licensing
          question or a permissions one — the department itself exists.
        </p>
      ) : null}
    </div>
  );
}

/* ═══════════════════ turning the registry into nodes on a map ═══════════════════ */

/**
 * The department you are looking at, as the core of its own map.
 *
 * Its `sub` and its screen count come from what this VIEWER can actually open, not from the
 * charter — the picture has to agree with the sidebar beside it, and a map claiming six
 * modules to somebody who can see two is the kind of small lie that costs a demo.
 */
function coreOf(dept: Department, moduleCount: number, _screenCount: number): BrainCore {
  return {
    id: dept.code,
    name: dept.code,
    letter: dept.letter,
    role: dept.component ? "the brain" : "the department",
    sub: `${moduleCount} modules`,
    accent: dept.accent,
    angle: 0,
    icon: dept.icon,
    kicker: dept.name,
    tagline: dept.tagline,
    blurb: dept.blurb,
    capabilities: dept.capabilities,
    systemOfRecord: dept.systemOfRecord,
    contracts: dept.contracts,
    // The core has no links of its own: everything you can open under this department is on
    // the satellites, and duplicating it here would give the same screen two doors on one
    // page. `screenCount` is what the strip above already reports.
    links: [],
  };
}

/** Another department, as a satellite of ONYX. */
function departmentNode(d: Department): BrainNode {
  const group = installedByDepartment().find((g) => g.department.code === d.code);
  const count = group?.modules.length ?? 0;
  return {
    id: d.code,
    name: d.code,
    letter: d.letter,
    sub: count === 1 ? "1 module" : `${count} modules`,
    accent: d.accent,
    angle: d.angle,
    icon: d.icon,
    kicker: d.name,
    tagline: d.tagline,
    blurb: d.blurb,
    capabilities: d.capabilities,
    systemOfRecord: d.systemOfRecord,
    contracts: d.contracts,
    links: [],
    // From ONYX you can walk into any agent, and the picture there is the same picture one
    // level down. That is the whole navigational idea: one shape, two depths.
    descend: { label: `Open ${d.code}`, href: `/department/${d.code}` },
  };
}

/**
 * A module, as a satellite of its own department.
 *
 * The charter fields come from the module's own manifest — `summary` is the tagline it
 * already declares, and each screen's `description` becomes a capability. Nothing here is
 * written twice: edit a screen's description and this card changes with it.
 */
function moduleNode(
  m: ModuleManifest,
  dept: Department,
  index: number,
  total: number,
  can: (p: string) => boolean,
): BrainNode {
  const entries = visibleNav(m, can);
  return {
    id: m.key,
    name: m.name,
    // Modules have no four-letter code, so the node carries the first letter of the name.
    // Two modules under one department starting with the same letter has not happened; if
    // it does, the name under the circle is what tells them apart, which is why it is there.
    letter: m.name.slice(0, 1).toUpperCase(),
    sub: entries.length === 1 ? "1 screen" : `${entries.length} screens`,
    accent: dept.accent,
    // Evenly spaced. Derived rather than declared, because modules come and go with a
    // licence and a hand-written angle would leave a gap in the ring.
    //
    // TWO MODULES START AT THREE O'CLOCK, NOT TWELVE. Starting at twelve puts a pair
    // directly above and below the core, in a column, inside a panel that is wider than it
    // is tall — the worst use of the space available. Left-and-right fills it. Three or more
    // start at twelve, which is where a reader expects the first item to be.
    angle: (total === 2 ? 0 : -90) + (index / Math.max(1, total)) * 360,
    icon: m.icon,
    kicker: `${dept.code} · ${dept.name}`,
    tagline: m.summary,
    blurb:
      entries.length > 0
        ? `${entries.length} screen${entries.length === 1 ? "" : "s"} you can open, listed below. Everything ${m.name} shows is read live from its own endpoints — this module owns those tables and nothing outside it writes to them.`
        : `${m.name} is installed and licensed, but no screen in it is open to you. That is a permissions question rather than a licensing one.`,
    // A screen's own description IS the capability. Written once, in the manifest, shown in
    // the band above the screen, on the sidebar hover, and here.
    capabilities: entries
      .filter((n) => n.description)
      .map((n) => ({
        icon: n.icon ?? m.icon,
        title: n.label,
        detail: n.description ?? "",
      })),
    systemOfRecord: [],
    contracts: [],
    links: entries.map((n) => ({
      label: n.label,
      href: `/${m.key}/${n.path}`,
      ...(n.icon ? { icon: n.icon } : {}),
    })),
    ...(entries[0] ? { descend: { label: `Open ${m.name}`, href: `/${m.key}/${entries[0].path}` } } : {}),
  };
}

/* -------------------------------------------------------------------------- */

function ModuleCard({
  module: m,
  accent,
  signals,
  can,
}: {
  module: ModuleManifest;
  accent: string;
  signals: readonly Loaded[];
  can: (p: string) => boolean;
}): React.JSX.Element {
  const entries = visibleNav(m, can);
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[m.icon] ?? Icons.Circle;

  // A card shows ONE chart at most. Two charts on a 340px card is a dashboard competing
  // with itself, and the reader ends up comparing shapes that have nothing to do with
  // each other.
  const composition = signals.find((s) => (s.value.series?.length ?? 0) > 1);
  const plain = signals.filter((s) => s !== composition);

  return (
    <article className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-white"
          style={{ background: accent }}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13.5px] font-bold text-[var(--text-primary)]">{m.name}</h2>
          <p className="truncate text-[10.5px] text-[var(--text-muted)]">
            {entries.length} screen{entries.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <p className="text-[12px] leading-[1.55] text-[var(--text-secondary)]">{m.summary}</p>

        {plain.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {plain.map((s) => (
              <div
                key={s.label}
                className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2.5"
              >
                <p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                  {s.label}
                </p>
                <p
                  className={cn(
                    "mt-1 text-[17px] font-bold leading-none",
                    s.value.tone === "ok" && "text-[var(--ok-ink)]",
                    s.value.tone === "warn" && "text-[var(--warn-ink)]",
                    s.value.tone === "bad" && "text-[var(--bad-ink)]",
                    (!s.value.tone || s.value.tone === "neutral") && "text-[var(--text-primary)]",
                  )}
                >
                  <CountUp value={s.value.value} />
                </p>
                {s.value.fraction !== undefined ? (
                  <Meter
                    fraction={s.value.fraction}
                    {...(s.value.tone ? { tone: s.value.tone } : {})}
                    className="mt-2"
                  />
                ) : null}
                {s.value.hint ? (
                  <p className="mt-1.5 text-[10.5px] leading-[1.4] text-[var(--text-muted)]">
                    {s.value.hint}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {composition?.value.series ? (
          <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
            <p className="mb-2.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
              {composition.label}
            </p>
            {/* The tone travels from the module untouched. An earlier version assigned
                colours by array position, which would have painted a "High" severity slice
                green whenever the Critical bucket happened to be empty — colour carrying a
                meaning the data never gave it. A series with no tones is drawn in a neutral
                ramp instead, and the figures are written beside every mark either way. */}
            {composition.value.series.length > 3 ? (
              <BarRows data={composition.value.series.map((d) => ({ ...d }))} />
            ) : (
              <Donut
                data={composition.value.series.map((d) => ({ ...d }))}
                total={composition.value.value}
                {...(composition.value.hint ? { totalLabel: composition.value.hint } : {})}
                size={112}
              />
            )}
          </div>
        ) : null}

        {/* The screens, as the way in. A dashboard that shows you a number and gives you
            nowhere to go with it has stopped halfway. */}
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {entries.map((n) => (
            <li key={n.path}>
              <Link
                href={`/${m.key}/${n.path}`}
                title={n.description ?? n.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                {n.label}
                <Icons.ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
