"use client";

import { useMemo } from "react";
import {
  ArrowLeftRight,
  Ban,
  CircleAlert,
  FlaskConical,
  Lock,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { PageHeader } from "@spine/shell/page-header";
import { date, humanise } from "@spine/format";
import { department } from "@spine/registry/departments";
import type { ScreenProps } from "@spine/registry/manifest";
import type {
  AiFeatureFact,
  CopilotIntentFact,
  Envelope,
  RegistryFeature,
} from "../api";
import {
  AI_FEATURE_FACTS,
  CHOKEPOINTS,
  COPILOT_INTENT_FACTS,
  FEATURE_CONSUMERS,
  FEATURE_GOLDEN_SET,
  ONYX_DEPENDS_ON_HEXA,
  OPEN_ITEMS,
  aiopsApi,
  departmentOfModule,
} from "../api";

/**
 * THE CONNECTION MAP — how the AI layer touches the rest of the product, and how it does
 * not.
 *
 * This screen exists because "AI-native ERP" is a claim that means nothing until somebody
 * can see the wiring. The wiring here is unusual and worth being precise about, because the
 * two directions are routinely confused and the confusion is the whole risk:
 *
 *   ONYX SERVES MODULES. A registered feature belongs to a module and runs on that module's
 *   behalf. Expenditure's receipt extractor is Expenditure's feature; ONYX supplies the
 *   router, the registry, the gate, the guardrails and the ledger it runs on. The business
 *   decision stays with the department that owns the data.
 *
 *   ONYX DEPENDS ON HEXA. The router, the governance port, the kill switch, the token
 *   budget and the hash-chained `ai_action_log` are platform property. ONYX owns no business
 *   table and reads no department's rows.
 *
 * What ONYX categorically does NOT have is an edge into anybody's data. There is no arrow
 * on this map from ONYX into a stock table or a ledger, and that absence is the point: the
 * blast radius of "AI" in this product is exactly the registered keys, and the registry is
 * closed.
 *
 * THE DIAGRAM IS HAND-DRAWN SVG, on purpose. A chart library would have to be told this
 * shape anyway, it would not survive the artifact CSP, and a diagram that only exists as
 * pixels is unreadable to a screen reader and unquotable in an email — so every edge is
 * also written out underneath in words.
 *
 * EVERY EDGE IS DRAWN FROM CODE. Registry contents from `feature-registry.ts`, consumption
 * edges from the actual adapter call sites in `apps/api/src/ai/`, copilot edges from
 * `copilot/intents.ts`, department accents from the same registry the sidebar groups by.
 * Nothing here is drawn because it would look good; where the code has no edge, the map has
 * no line, and where the code disagrees with a blueprint, the disagreement is on screen.
 *
 * READ-ONLY. No control on this screen changes anything, and the kill switch in particular
 * is described here and operated nowhere.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Edges, computed from the transcribed facts rather than written down twice
   ══════════════════════════════════════════════════════════════════════════ */

interface DepartmentEdge {
  code: string;
  /** Features whose OWNER module belongs to this department. */
  owned: readonly AiFeatureFact[];
  /** The explicit "no MVP AI" entries — a declared absence, not a gap. */
  nulls: readonly AiFeatureFact[];
  /** Features owned elsewhere that a module of THIS department actually calls. */
  consumed: readonly AiFeatureFact[];
  /** Copilot questions that read this department's tables. */
  intents: readonly CopilotIntentFact[];
}

function edgeFor(code: string): DepartmentEdge {
  const mine = AI_FEATURE_FACTS.filter((f) => departmentOfModule(f.ownerModule) === code);
  return {
    code,
    owned: mine.filter((f) => f.status !== "no_mvp_ai"),
    nulls: mine.filter((f) => f.status === "no_mvp_ai"),
    consumed: AI_FEATURE_FACTS.filter(
      (f) =>
        departmentOfModule(f.ownerModule) !== code &&
        (FEATURE_CONSUMERS[f.key] ?? []).some((m) => departmentOfModule(m) === code),
    ),
    intents: COPILOT_INTENT_FACTS.filter((i) => departmentOfModule(i.module) === code),
  };
}

/** The six spokes, in the order they are drawn clockwise from the top. */
const SPOKE_CODES = ["HEXA", "MICA", "RASP", "KILN", "SPAR", "AXLE"] as const;

/** Sentence form of one spoke — used for the diagram's text equivalent and nowhere else. */
function edgeSentence(e: DepartmentEdge): string {
  const d = department(e.code);
  const parts: string[] = [];
  if (e.owned.length > 0) {
    parts.push(
      `${e.owned.length} registered AI feature${e.owned.length === 1 ? "" : "s"} (${e.owned.map((f) => f.key).join(", ")})`,
    );
  }
  if (e.nulls.length > 0) parts.push(`${e.nulls.length} explicit "no MVP AI" entry`);
  if (e.consumed.length > 0) {
    parts.push(`${e.consumed.map((f) => f.key).join(", ")} consumed but owned elsewhere`);
  }
  if (e.intents.length > 0) {
    parts.push(
      `${e.intents.length} read-only copilot question${e.intents.length === 1 ? "" : "s"}`,
    );
  }
  if (parts.length === 0) parts.push("no AI connection of any kind");
  return `ONYX ↔ ${e.code} (${d?.name ?? e.code}): ${parts.join("; ")}.`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The diagram
   ══════════════════════════════════════════════════════════════════════════ */

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface SpokeGeometry {
  /** Top-left of the department node box (196 × 76). */
  node: { x: number; y: number };
  /** The violet edge — a registered feature flows along it. Null when none exists. */
  solid: Line | null;
  /** The muted dashed edge — a copilot question reads along it. */
  dashed: Line | null;
  label: { x: number; y: number; anchor: "start" | "middle" | "end" };
}

/**
 * Hand-placed geometry. Six nodes around a hub, laid out so no label crosses a line and no
 * two labels share a band. Chosen by eye and checked by arithmetic; a layout algorithm for
 * six fixed boxes would be more code and a worse picture.
 */
const GEOMETRY: Readonly<Record<string, SpokeGeometry>> = {
  HEXA: {
    node: { x: 402, y: 24 },
    // HEXA is the only two-way spoke, so it gets two lines rather than one: the platform
    // ports coming DOWN into ONYX, and the features ONYX runs going back UP.
    solid: { x1: 522, y1: 262, x2: 522, y2: 104 },
    dashed: null,
    label: { x: 534, y: 158, anchor: "start" },
  },
  MICA: {
    node: { x: 748, y: 152 },
    solid: { x1: 608, y1: 292, x2: 742, y2: 200 },
    dashed: { x1: 608, y1: 306, x2: 742, y2: 216 },
    label: { x: 676, y: 204, anchor: "middle" },
  },
  RASP: {
    node: { x: 748, y: 414 },
    solid: { x1: 608, y1: 334, x2: 742, y2: 432 },
    dashed: { x1: 608, y1: 348, x2: 742, y2: 448 },
    label: { x: 670, y: 424, anchor: "middle" },
  },
  KILN: {
    node: { x: 402, y: 542 },
    solid: null,
    dashed: { x1: 500, y1: 372, x2: 500, y2: 536 },
    label: { x: 516, y: 436, anchor: "start" },
  },
  SPAR: {
    node: { x: 56, y: 414 },
    solid: { x1: 392, y1: 334, x2: 258, y2: 432 },
    dashed: { x1: 392, y1: 348, x2: 258, y2: 448 },
    // Nudged right of centre: the longest label here is a feature key, and centring it on
    // the spoke put its first character inside the SPAR node box.
    label: { x: 336, y: 424, anchor: "middle" },
  },
  AXLE: {
    node: { x: 56, y: 152 },
    solid: { x1: 392, y1: 292, x2: 258, y2: 200 },
    dashed: { x1: 392, y1: 306, x2: 258, y2: 216 },
    // Same nudge as SPAR, for the same reason: the feature key is the widest label drawn.
    label: { x: 332, y: 204, anchor: "middle" },
  },
};

const NODE_W = 196;
const NODE_H = 76;

/** The label beside each spoke — short, and every line of it is a fact from the code. */
function spokeLabelLines(e: DepartmentEdge): readonly string[] {
  const lines: string[] = [];
  if (e.owned.length > 0) {
    lines.push(`${e.owned.length} registered feature${e.owned.length === 1 ? "" : "s"}`);
  }
  if (e.nulls.length > 0) lines.push(`1 declared "no MVP AI"`);
  for (const f of e.consumed) lines.push(`${f.key} (consumed)`);
  if (e.owned.length === 0 && e.consumed.length === 0 && e.nulls.length === 0) {
    lines.push("no registered feature");
  }
  if (e.intents.length > 0) {
    lines.push(`${e.intents.length} copilot question${e.intents.length === 1 ? "" : "s"}`);
  }
  return lines;
}

function DepartmentNode({ code }: { code: string }): React.JSX.Element | null {
  const g = GEOMETRY[code];
  const d = department(code);
  if (!g) return null;
  const accent = d?.accent ?? "var(--text-muted)";
  // `blueprints` carries `{ file, moduleKey?, missing? }` rather than a bare filename — the
  // department registry records what each specification shipped as, so nothing else has to
  // keep a second copy of that correspondence.
  const blueprints = (d?.blueprints ?? []).map((b) => b.file.replace(/\.md$/, "")).join(" · ");

  return (
    <g>
      <rect
        x={g.node.x}
        y={g.node.y}
        width={NODE_W}
        height={NODE_H}
        rx={11}
        style={{ fill: "var(--surface)", stroke: "var(--border-subtle)" }}
        strokeWidth={1}
      />
      {/* The accent bar, from the same department record the sidebar reads. Never a status
          colour — a department that looked "approved" or "overdue" would mislead. */}
      <rect
        x={g.node.x}
        y={g.node.y + 8}
        width={5}
        height={NODE_H - 16}
        rx={2.5}
        style={{ fill: accent }}
      />
      <text
        x={g.node.x + 18}
        y={g.node.y + 28}
        fontSize={15}
        fontWeight={800}
        letterSpacing="0.06em"
        style={{ fill: accent }}
      >
        {code}
      </text>
      <text
        x={g.node.x + 18}
        y={g.node.y + 47}
        fontSize={11}
        fontWeight={600}
        style={{ fill: "var(--text-secondary)" }}
      >
        {d?.name ?? code}
      </text>
      <text
        x={g.node.x + 18}
        y={g.node.y + 63}
        fontSize={8.5}
        fontWeight={600}
        letterSpacing="0.04em"
        style={{ fill: "var(--text-muted)" }}
      >
        {blueprints}
      </text>
    </g>
  );
}

function ConnectionDiagram({ edges }: { edges: readonly DepartmentEdge[] }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 1000 640"
      className="h-auto w-full"
      style={{ maxWidth: "100%" }}
      role="img"
      aria-labelledby="onyx-map-title onyx-map-desc"
    >
      <title id="onyx-map-title">
        How AI Operations connects to the six departments
      </title>
      <desc id="onyx-map-desc">
        A hub-and-spoke diagram. AI Operations sits at the centre and owns no business data.
        Six departments surround it. A solid violet line means a registered AI feature runs
        for that department; a dashed grey line means the copilot can read that department&apos;s
        tables to answer a question. The full list of edges is written out in text
        immediately below the diagram.
      </desc>

      <defs>
        <marker id="onyx-arrow-violet" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--violet)" }} />
        </marker>
        <marker id="onyx-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--text-muted)" }} />
        </marker>
        <marker id="onyx-arrow-brand" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--brand)" }} />
        </marker>
      </defs>

      {/* ---- the HEXA dependency edge: platform ports coming DOWN into ONYX ---- */}
      <line
        x1={478}
        y1={104}
        x2={478}
        y2={262}
        strokeWidth={1.8}
        markerEnd="url(#onyx-arrow-brand)"
        style={{ stroke: "var(--brand)" }}
      />
      <text x={466} y={152} fontSize={9.5} fontWeight={700} textAnchor="end" style={{ fill: "var(--brand)" }}>
        AiPort · AiGovernancePort
      </text>
      <text x={466} y={166} fontSize={9.5} fontWeight={600} textAnchor="end" style={{ fill: "var(--text-muted)" }}>
        kill switch · token budget · opt-out
      </text>
      <text x={466} y={180} fontSize={9.5} fontWeight={600} textAnchor="end" style={{ fill: "var(--text-muted)" }}>
        ai_action_log (hash-chained)
      </text>

      {/* ---- one spoke per department ---- */}
      {edges.map((e) => {
        const g = GEOMETRY[e.code];
        if (!g) return null;
        const lines = spokeLabelLines(e);
        return (
          <g key={e.code}>
            {g.solid ? (
              <line
                x1={g.solid.x1}
                y1={g.solid.y1}
                x2={g.solid.x2}
                y2={g.solid.y2}
                strokeWidth={1.8}
                markerEnd="url(#onyx-arrow-violet)"
                style={{ stroke: "var(--violet)" }}
              />
            ) : null}
            {g.dashed ? (
              <line
                x1={g.dashed.x1}
                y1={g.dashed.y1}
                x2={g.dashed.x2}
                y2={g.dashed.y2}
                strokeWidth={1.4}
                strokeDasharray="5 4"
                markerEnd="url(#onyx-arrow-muted)"
                style={{ stroke: "var(--text-muted)" }}
              />
            ) : null}
            {lines.map((line, i) => (
              <text
                key={line}
                x={g.label.x}
                y={g.label.y + i * 14}
                fontSize={9.5}
                fontWeight={i === 0 ? 700 : 600}
                textAnchor={g.label.anchor}
                style={{
                  fill:
                    line.includes("copilot question")
                      ? "var(--text-muted)"
                      : line.startsWith("no registered")
                        ? "var(--text-muted)"
                        : "var(--ai-text)",
                }}
              >
                {line}
              </text>
            ))}
            <DepartmentNode code={e.code} />
          </g>
        );
      })}

      {/* ---- the hub ---- */}
      <rect
        x={392}
        y={268}
        width={216}
        height={104}
        rx={14}
        style={{ fill: "var(--violet-soft)", stroke: "var(--violet)" }}
        strokeWidth={1.5}
      />
      <text x={500} y={303} fontSize={22} fontWeight={800} textAnchor="middle" letterSpacing="0.08em" style={{ fill: "var(--ai-text)" }}>
        ONYX
      </text>
      <text x={500} y={323} fontSize={11.5} fontWeight={650} textAnchor="middle" style={{ fill: "var(--text-secondary)" }}>
        AI Operations
      </text>
      <text x={500} y={340} fontSize={9.5} fontWeight={600} textAnchor="middle" style={{ fill: "var(--text-muted)" }}>
        a component, not a department
      </text>
      <text x={500} y={355} fontSize={9.5} fontWeight={600} textAnchor="middle" style={{ fill: "var(--text-muted)" }}>
        owns no business table
      </text>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Small presentational pieces
   ══════════════════════════════════════════════════════════════════════════ */

function Panel({
  title,
  sub,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="card">
      <div className="panel-h">
        <span>{title}</span>
        {sub ? <span className="panel-h-sub">{sub}</span> : null}
      </div>
      <div className="panel-b">{children}</div>
    </section>
  );
}

function DeptMarker({ code }: { code: string }): React.JSX.Element {
  const accent = department(code)?.accent ?? "var(--text-muted)";
  return (
    <span
      className="inline-block shrink-0 rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.1em] text-white"
      style={{ background: accent }}
    >
      {code}
    </span>
  );
}

function Mono({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-[var(--font-mono)] text-[11.5px]">
      {children}
    </code>
  );
}

const RISK_TIER_LABEL: Readonly<Record<string, string>> = {
  "1": "Advisory",
  "2": "May draft, never commit",
  "3": "Advisory forever",
};

/* ══════════════════════════════════════════════════════════════════════════
   The screen
   ══════════════════════════════════════════════════════════════════════════ */

export default function ConnectionMapScreen(_props: ScreenProps): React.JSX.Element {
  // The registry is COMPILED IN, so its contents are the same in both places by
  // construction. What the API adds is per-tenant: how far each feature has rolled out and
  // whether its last eval gate passed. If that read fails the map still draws — it simply
  // says the two columns were not read, rather than implying a pass.
  const reg = useQuery<Envelope<RegistryFeature>>(aiopsApi.registryPath);
  const liveByKey = useMemo(
    () => new Map((reg.data?.data ?? []).map((f) => [f.key, f])),
    [reg.data],
  );

  const edges = useMemo(() => SPOKE_CODES.map((c) => edgeFor(c)), []);

  const registered = AI_FEATURE_FACTS.filter((f) => f.status !== "no_mvp_ai");
  const withGoldenSet = registered.filter((f) => FEATURE_GOLDEN_SET[f.key]).length;
  const departmentsServed = edges.filter(
    (e) => e.owned.length > 0 || e.consumed.length > 0,
  ).length;

  /** The copilot catalogue folded by module, for the read-only edge table. */
  const copilotByModule = useMemo(() => {
    const map = new Map<string, CopilotIntentFact[]>();
    for (const i of COPILOT_INTENT_FACTS) {
      const list = map.get(i.module);
      if (list) list.push(i);
      else map.set(i.module, [i]);
    }
    return [...map.entries()]
      .map(([module, intents]) => ({ module, dept: departmentOfModule(module), intents }))
      .sort(
        (a, b) =>
          a.dept.localeCompare(b.dept) ||
          b.intents.length - a.intents.length ||
          a.module.localeCompare(b.module),
      );
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Connection map"
        subtitle="Where the AI layer touches the rest of the product, and where it deliberately does not. Every line on this page is drawn from code — the closed feature registry, the actual call sites, and the copilot's closed question catalogue."
        meta={[
          { label: "Registered features", value: String(registered.length) },
          { label: "Departments served", value: `${departmentsServed} of 6` },
          { label: "Copilot questions", value: String(COPILOT_INTENT_FACTS.length) },
          { label: "Business tables owned", value: "0" },
        ]}
      />

      {/* ---------------------------------------------------------------- */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[13px] leading-5 text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">
          Two directions, and they are not the same direction.
        </span>{" "}
        ONYX <strong>serves</strong> modules: a registered feature belongs to a module and
        runs on that module&apos;s behalf, so the business decision stays with the department
        that owns the data. ONYX <strong>depends on</strong> HEXA for the router, the
        governance port, the kill switch, the budget and the audit chain. There is no third
        direction — no arrow from here into anybody&apos;s tables.
      </div>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title="ONYX and the six departments"
        sub="hand-drawn from the registry, the call sites and the intent catalogue"
      >
        <ConnectionDiagram edges={edges} />

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[var(--border-subtle)] pt-3 text-[11.5px] text-[var(--text-secondary)]">
          <li className="flex items-center gap-2">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" y1="4" x2="26" y2="4" strokeWidth="1.8" style={{ stroke: "var(--violet)" }} />
            </svg>
            A registered AI feature runs for that department
          </li>
          <li className="flex items-center gap-2">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" y1="4" x2="26" y2="4" strokeWidth="1.4" strokeDasharray="5 4" style={{ stroke: "var(--text-muted)" }} />
            </svg>
            The copilot may read that department&apos;s tables, read-only
          </li>
          <li className="flex items-center gap-2">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" y1="4" x2="26" y2="4" strokeWidth="1.8" style={{ stroke: "var(--brand)" }} />
            </svg>
            A platform port ONYX depends on
          </li>
        </ul>

        {/* The diagram in words. Not a fallback — an equal rendering, because this is the
            paragraph somebody pastes into an email or reads with a screen reader. */}
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <h3 className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
            The same map in words
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
            <li>
              <strong className="text-[var(--text-primary)]">ONYX is the hub.</strong> It owns
              the router, the closed registry, prompt lifecycle, eval gates, guardrails, the
              cost ledger, PII egress and the kill switch — and no business table.
            </li>
            {edges.map((e) => (
              <li key={e.code}>{edgeSentence(e)}</li>
            ))}
            <li>
              ONYX depends on HEXA in the other direction, for{" "}
              <Mono>AiPort</Mono>, <Mono>AiGovernancePort</Mono>, the kill switch, the daily
              token budget and the hash-chained <Mono>ai_action_log</Mono>.
            </li>
          </ul>
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--ai-text)]" aria-hidden />
            Direction one — ONYX serves modules
          </span>
        }
        sub={`${withGoldenSet} of ${registered.length} have a golden set in the repository`}
      >
        <p className="mb-3 max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          A registered feature belongs to a module. ONYX supplies the plumbing it runs on and
          the gate it has to pass; the module supplies the data, the meaning and the person
          who approves the result. The <strong>Consumed by</strong> column is the interesting
          one — <Mono>general.master_dedup</Mono> is owned by Platform but called from four
          modules in four departments, which is why edges reach departments that own no AI
          feature of their own.
        </p>

        {reg.error ? (
          <p className="mb-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2.5 text-[12px] text-[var(--text-secondary)]">
            The per-tenant read failed, so <strong>Rollout</strong> and{" "}
            <strong>Eval gate</strong> below say &ldquo;not read&rdquo; rather than guessing.
            The registry itself is compiled into the platform and is shown in full.
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="grid-table">
            <caption className="sr-only">
              Every registered AI feature, the department that owns its module, its risk
              tier, rollout stage, eval-gate verdict and golden set
            </caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Owner</th>
                <th scope="col">Risk tier</th>
                <th scope="col">Status</th>
                <th scope="col">Rollout</th>
                <th scope="col">Eval gate</th>
                <th scope="col">Consumed by</th>
              </tr>
            </thead>
            <tbody>
              {AI_FEATURE_FACTS.map((f) => {
                const live = liveByKey.get(f.key);
                const consumers = FEATURE_CONSUMERS[f.key] ?? [];
                const golden = FEATURE_GOLDEN_SET[f.key] ?? null;
                const ownerDept = departmentOfModule(f.ownerModule);
                const isNull = f.status === "no_mvp_ai";
                return (
                  <tr key={f.key}>
                    <td>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {f.displayName}
                      </div>
                      <div className="text-[11.5px] text-[var(--text-secondary)]">
                        <Mono>{f.key}</Mono> · {f.ref}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                        {isNull
                          ? "Declares no AI on purpose. Nothing to switch off."
                          : `Off ⇒ ${f.degradedMode.replace(/_/g, " ")}; baseline to beat: ${f.deterministicBaseline}`}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <DeptMarker code={ownerDept} />
                        <span className="text-[12px] text-[var(--text-secondary)]">
                          {humanise(f.ownerModule)}
                        </span>
                      </div>
                    </td>
                    <td>
                      {f.riskTier === null ? (
                        <span className="text-[var(--text-muted)]">—</span>
                      ) : (
                        <div>
                          <div className="text-[var(--text-primary)]">Tier {f.riskTier}</div>
                          <div className="text-[11.5px] text-[var(--text-secondary)]">
                            {RISK_TIER_LABEL[String(f.riskTier)] ?? ""}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          f.status === "committed"
                            ? "chip chip-violet"
                            : f.status === "in_eval"
                              ? "chip chip-warn"
                              : "chip chip-grey"
                        }
                      >
                        {humanise(f.status)}
                      </span>
                    </td>
                    <td>
                      {reg.loading ? (
                        <span className="text-[11.5px] text-[var(--text-muted)]">Reading…</span>
                      ) : live ? (
                        <span className="text-[12px] text-[var(--text-secondary)]">
                          {humanise(live.rolloutStage)}
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-[var(--text-muted)]">Not read</span>
                      )}
                    </td>
                    <td>
                      {reg.loading ? (
                        <span className="text-[11.5px] text-[var(--text-muted)]">Reading…</span>
                      ) : !live ? (
                        <span className="text-[11.5px] text-[var(--text-muted)]">Not read</span>
                      ) : live.lastEvalVerdict === null ? (
                        // Never evaluated is not the same as passed, and it must not look
                        // like it. The golden set is named so the gap is actionable.
                        <div>
                          <span className="chip chip-grey">Never run</span>
                          <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                            {golden ? `Set: ${golden}` : "No golden set in the repo"}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span
                            className={live.lastEvalVerdict === "pass" ? "chip chip-ok" : "chip chip-bad"}
                          >
                            {live.lastEvalVerdict === "pass" ? "Passed" : "Failed"}
                          </span>
                          <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                            {date(live.lastEvalAt)}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {consumers.length === 0 ? (
                        <span className="text-[11.5px] text-[var(--text-muted)]">
                          {isNull ? "—" : "Nothing calls it yet"}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {consumers.map((m) => (
                            <span key={m} className="inline-flex items-center gap-1">
                              <DeptMarker code={departmentOfModule(m)} />
                              <span className="text-[11.5px] text-[var(--text-secondary)]">
                                {humanise(m)}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-[var(--brand)]" aria-hidden />
            Direction two — ONYX depends on HEXA
          </span>
        }
        sub="NAME.md §4, the ONYX ↔ HEXA row"
      >
        <p className="mb-3 max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          Everything ONYX runs on is platform property. That is deliberate: the kill switch
          and the audit chain must not be owned by the layer they are there to restrain.
          ONYX owns no business data and reaches into no department&apos;s tables.
        </p>
        <div className="overflow-x-auto">
          <table className="grid-table">
            <caption className="sr-only">
              The platform ports and records AI Operations depends on, and where each lives
            </caption>
            <thead>
              <tr>
                <th scope="col">Port or record</th>
                <th scope="col">What it does</th>
                <th scope="col">Where it lives</th>
              </tr>
            </thead>
            <tbody>
              {ONYX_DEPENDS_ON_HEXA.map((d) => (
                <tr key={d.port}>
                  <td className="whitespace-nowrap">
                    <Mono>{d.port}</Mono>
                  </td>
                  <td className="text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
                    {d.what}
                  </td>
                  <td className="text-[11.5px] text-[var(--text-muted)]">{d.file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2.5 text-[12px] leading-[1.5] text-[var(--text-secondary)]">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]" aria-hidden />
          <span>
            <strong className="text-[var(--text-primary)]">Ownership of this seam is open.</strong>{" "}
            The <Mono>platform/ai</Mono> router package currently ships with HEXA&apos;s
            bootstrap. Whether it moves to ONYX is open item 5 in NAME.md and needs a
            decision, not a drift.
          </span>
        </p>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-[var(--ai-text)]" aria-hidden />
            The copilot&apos;s edges — a different shape entirely
          </span>
        }
        sub={`${COPILOT_INTENT_FACTS.length} questions across ${copilotByModule.length} modules`}
      >
        <div className="mb-3 max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          <p>
            <strong className="text-[var(--text-primary)]">The model classifies, and does
            nothing else.</strong>{" "}
            It decides which of the questions below is being asked and what the parameters
            are — a classification with a fixed output vocabulary. It never writes SQL, never
            chooses a table, and never sees a row. Everything after the classification is
            ordinary code: a hand-written, reviewed, read-only <Mono>SELECT</Mono>.
          </p>
          <p className="mt-2">
            Each question declares a permission the asker must already hold, so the copilot
            can only surface what that person could open a screen for. Parameters are
            re-read from the question rather than taken from the model&apos;s reply, and a
            model naming an intent outside this list is refused by the same check that
            catches a typo. Routing runs deterministically first, so pulling the kill switch
            costs phrasing, not function.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="grid-table">
            <caption className="sr-only">
              Copilot questions grouped by the module they read, with the permission each
              requires
            </caption>
            <thead>
              <tr>
                <th scope="col">Department</th>
                <th scope="col">Module read</th>
                <th scope="col">Questions</th>
                <th scope="col">What can be asked</th>
                <th scope="col">Permission required</th>
              </tr>
            </thead>
            <tbody>
              {copilotByModule.map((g) => {
                const permissions = [...new Set(g.intents.map((i) => i.permission))];
                return (
                  <tr key={g.module}>
                    <td>
                      <DeptMarker code={g.dept} />
                    </td>
                    <td className="whitespace-nowrap text-[var(--text-primary)]">
                      {humanise(g.module)}
                    </td>
                    <td data-numeric="" className="text-[var(--text-primary)]">
                      {g.intents.length}
                    </td>
                    <td>
                      <ul className="flex flex-col gap-0.5 text-[12px] text-[var(--text-secondary)]">
                        {g.intents.map((i) => (
                          <li key={i.key}>{i.question}</li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {permissions.map((p) => (
                          <Mono key={p}>{p}</Mono>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex items-start gap-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Platform &amp; Governance appears nowhere in this table, and that is correct: no
            copilot question reads a HEXA module. There is also no question that changes
            anything — an instruction is refused with the reason stated, rather than
            answered with a list that makes it look as though something happened.
          </span>
        </p>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Ban className="h-4 w-4 text-[var(--bad)]" aria-hidden />
            The chokepoints, and the file each one lives in
          </span>
        }
        sub="enforced, not documented"
      >
        <p className="mb-3 max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          Every one of these is a line of code on the path of every AI call, in this order:
          registry check, then governance (opt-out, kill switch, budget), then the provider,
          then the log. A refusal is a correct outcome and it is recorded as one.
        </p>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {CHOKEPOINTS.map((c) => (
            <div
              key={c.name}
              className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3"
            >
              <div className="text-[12.5px] font-bold text-[var(--text-primary)]">{c.name}</div>
              <p className="mt-1 text-[12px] leading-[1.5] text-[var(--text-secondary)]">
                {c.detail}
              </p>
              <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{c.file}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-[var(--warn)]" aria-hidden />
            Open items, on screen
          </span>
        }
        sub={`${OPEN_ITEMS.length} unresolved`}
      >
        <p className="mb-3 max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          A governance console that hides its own open items is not a governance console.
          These are ONYX&apos;s, found in ONYX&apos;s own code and in the blueprints it is
          meant to police.
        </p>
        <ol className="flex flex-col gap-2.5">
          {OPEN_ITEMS.map((o, i) => (
            <li
              key={o.title}
              className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-3"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                <span className="text-[12.5px] font-bold text-[var(--text-primary)]">
                  {o.title}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-[1.55] text-[var(--text-secondary)]">
                {o.detail}
              </p>
              <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{o.source}</div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
