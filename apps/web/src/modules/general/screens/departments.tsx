"use client";

import * as Icons from "lucide-react";
import { DataTable, type Column } from "@spine/data/data-table";
import { PageHeader } from "@spine/shell/page-header";
import { cn } from "@spine/ui/cn";
import type { ModuleManifest, ScreenProps } from "@spine/registry/manifest";
import {
  DEPARTMENTS,
  blueprintStatus,
  department,
  installedByDepartment,
  type Department,
} from "@spine/registry/departments";

/**
 * DEPARTMENTS & AGENTS — the organisation that built this system, stated in the system.
 *
 * This screen exists because the structure is not decoration. Departments here are cut by
 * SYSTEM-OF-RECORD OWNERSHIP: one department owns a fact, and owning it means owning the
 * only code that writes it. That is the same line the module boundaries in the codebase are
 * drawn on, which is why a buyer who reads this page has already understood the
 * architecture — "Supply Chain owns the stock ledger, so Manufacturing asks for a movement
 * instead of writing one" is the whole design in a sentence.
 *
 * The treaty table is the valuable part. Every seam between two departments has a named
 * contract, and each of those contracts is an obligation between named owners rather than a
 * diagram. Architecture written as obligations is architecture somebody can be held to.
 *
 * ONE SOURCE. The seven come from `@spine/registry/departments`, the same list the sidebar
 * groups by, and the modules under each of them come from `installedByDepartment()` — the
 * real registry, not a list typed out here. If this screen kept its own copy the two would
 * disagree within a month, which is the exact shape of the failure that put every permission
 * in one registry after three copies of that list drifted far enough to answer 403 to
 * everybody, administrator included.
 *
 * TWO LISTS PER CARD, ON PURPOSE. Blueprints are what a department was SPECIFIED to own.
 * Installed modules are what this build ACTUALLY contains. Where they disagree the
 * disagreement is the point: Expenditure is specified to RASP and is deliberately not in
 * this build, and saying that out loud is the clearest available proof that a module here is
 * genuinely removable rather than merely described as removable.
 *
 * WHAT IS DELIBERATELY NOT HERE: the open items and the rejected names from `NAME.md`.
 * Those are internal working notes. This screen is shown to buyers.
 *
 * READ-ONLY. Nothing here can be edited from the product; changing the organisation is a
 * decision, not a form.
 */

function Icon({ name, className }: { name?: string; className?: string }): React.JSX.Element {
  const Cmp =
    (name ? (Icons as unknown as Record<string, Icons.LucideIcon>)[name] : undefined) ??
    Icons.Circle;
  return <Cmp className={className} aria-hidden />;
}

/**
 * The four-letter code as a coloured marker — the same marker the sidebar uses over each
 * department's modules, so the two read as one thing.
 *
 * The colour comes from the department record, never from the status palette. A department
 * colour that could be mistaken for "approved" or "overdue" would be actively misleading.
 */
function Marker({ code }: { code: string }): React.JSX.Element {
  const accent = department(code)?.accent ?? "var(--text-muted)";
  return (
    <span
      className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.1em] text-white"
      style={{ background: accent }}
    >
      {code}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   The cross-department contracts, from NAME.md §4.

   Extracted from the blueprints' own event tables and boundary sections, not invented —
   which is why they are written here as the identifiers they actually are. A reader who
   greps `prod.wo.produced` in the codebase finds the event this row is talking about.
   --------------------------------------------------------------------------- */

interface ContractItem {
  label: string;
  /** An identifier a reader could search for: an endpoint, an event name, a port. */
  mono?: boolean;
}

interface Treaty {
  id: string;
  from: string;
  /** The counterpart department, or null when the contract is with every department. */
  to: string | null;
  direction: "one-way" | "both-ways";
  contract: readonly ContractItem[];
  note: string;
  /** The two the blueprints single out. */
  mark?: string;
}

const TREATIES: readonly Treaty[] = [
  {
    id: "hexa-all",
    from: "HEXA",
    to: null,
    direction: "one-way",
    contract: [
      { label: "WorkflowExecutor", mono: true },
      { label: "AiPort", mono: true },
      { label: "outbox_event", mono: true },
      { label: "audit_log", mono: true },
      { label: "Keycloak OIDC" },
    ],
    note: "No department re-implements identity, approvals or audit. They are inherited, once, from the platform bootstrap.",
  },
  {
    id: "spar-kiln",
    from: "SPAR",
    to: "KILN",
    direction: "both-ways",
    contract: [
      { label: "POST /api/stock/entries", mono: true },
      { label: "purchase.grn.submitted", mono: true },
      { label: "prod.wo.produced", mono: true },
    ],
    note: "Manufacturing never writes stock tables directly — it asks for a movement through the one endpoint Supply Chain owns. Production stays switched off until Inventory reaches its 95–99% stock-accuracy target.",
  },
  {
    id: "axle-kiln",
    from: "AXLE",
    to: "KILN",
    direction: "both-ways",
    contract: [
      { label: "Planned orders become work orders" },
      { label: "prod.wo.produced", mono: true },
      { label: "prod.wo.deviation", mono: true },
      { label: "eng.eco.applied", mono: true },
    ],
    note: "Planning's own lightweight scheduler is switched off per plant the moment full Planning is installed. Two planning engines ordering the same item twice is a failure other ERPs are documented to have shipped.",
    mark: "Tightest treaty in the system",
  },
  {
    id: "axle-spar",
    from: "AXLE",
    to: "SPAR",
    direction: "both-ways",
    contract: [
      { label: "planning.pr.created", mono: true },
      { label: "grn.posted", mono: true },
    ],
    note: "A planned requirement becomes a purchase request, and the receipt date comes back to correct the lead time that produced it. The link to the demand that caused it must survive that conversion.",
  },
  {
    id: "mica-axle",
    from: "MICA",
    to: "AXLE",
    direction: "both-ways",
    contract: [{ label: "so.confirmed", mono: true }],
    note: "A confirmed sales order becomes demand the plan has to answer.",
  },
  {
    id: "mica-kiln",
    from: "MICA",
    to: "KILN",
    direction: "both-ways",
    contract: [
      { label: "csp.complaint.created.v1", mono: true },
      { label: "qms.ncr.created.v1", mono: true },
      { label: "qms.capa.status_changed.v1", mono: true },
    ],
    note: "A customer complaint becomes a non-conformance on the shop floor, and the corrective action reports its status back to the person who took the call.",
    mark: "Most fully specified contract in the set",
  },
  {
    id: "rasp-kiln",
    from: "RASP",
    to: "KILN",
    direction: "both-ways",
    contract: [
      { label: "hrm.attendance.day_finalised.v1", mono: true },
      { label: "GET /internal/labour-cost/daily", mono: true },
      { label: "maintenance.external.work.requested.v1", mono: true },
    ],
    note: "Labour cost reaches work-order costing only after the day's attendance is finalised, so a job is never costed against hours that are still being corrected.",
  },
  {
    id: "rasp-spar",
    from: "RASP",
    to: "SPAR",
    direction: "both-ways",
    contract: [{ label: "Indirect purchase requests hand off to Purchase's PO engine" }],
    note: "Expenditure has no purchase-order engine of its own, on purpose. One engine raises every purchase order in the company, whether it buys steel or stationery.",
  },
  {
    id: "onyx-hexa",
    from: "ONYX",
    to: "HEXA",
    direction: "both-ways",
    contract: [
      { label: "AiGovernancePort", mono: true },
      { label: "ai_action_log", mono: true },
      { label: "platform/ai", mono: true },
    ],
    note: "Opt-out, token budget, kill switch and an action log. Every AI feature in the product reaches the model through this one governed path, and the router package ships inside the platform bootstrap.",
  },
];

/* ------------------------------- the screen ------------------------------- */

export default function DepartmentsScreen(_props: ScreenProps): React.JSX.Element {
  // Departments first, the component last. ONYX sits at the end because it is horizontal:
  // reading it after the six it serves is the right order to understand it in.
  const ordered = [...DEPARTMENTS].sort(
    (a, b) => Number(a.component ?? false) - Number(b.component ?? false),
  );
  const departmentCount = DEPARTMENTS.filter((d) => !d.component).length;
  const componentCount = DEPARTMENTS.length - departmentCount;

  // The live registry, via the spine — INSTALLED, not filtered by licence or permission.
  const groups = installedByDepartment();
  const byCode = new Map(groups.map((g) => [g.department.code, g.modules]));
  const installedCount = groups.reduce((n, g) => n + g.modules.length, 0);

  const columns: ReadonlyArray<Column<Treaty>> = [
    {
      key: "seam",
      header: "Seam",
      width: "w-56",
      render: (t) => (
        <div className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <Marker code={t.from} />
            <span className="text-[var(--text-muted)]" aria-hidden>
              {t.direction === "one-way" ? "→" : "↔"}
            </span>
            {t.to ? (
              <Marker code={t.to} />
            ) : (
              <span className="text-[11.5px] font-semibold text-[var(--text-secondary)]">
                every department
              </span>
            )}
          </span>
          {/* Spoken form for anyone not reading the colours. */}
          <span className="sr-only">
            {t.from} {t.direction === "one-way" ? "to" : "and"} {t.to ?? "every department"}
          </span>
          {t.mark ? <span className="chip chip-gold self-start">{t.mark}</span> : null}
        </div>
      ),
    },
    {
      key: "contract",
      header: "Contract",
      render: (t) => (
        <ul className="flex flex-col gap-1">
          {t.contract.map((c) => (
            <li key={c.label}>
              {c.mono ? (
                <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11.5px] text-[var(--text-primary)]">
                  {c.label}
                </code>
              ) : (
                <span className="text-[12.5px] text-[var(--text-secondary)]">{c.label}</span>
              )}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "note",
      header: "Note",
      render: (t) => (
        <p className="max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          {t.note}
        </p>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Departments & agents"
        subtitle="Six departments and one cross-cutting component build and own this system. Each department is the system of record for a part of the factory, and every seam between two of them has a written contract. This page is that organisation, exactly as the software is built to it."
        meta={[
          { label: "Departments", value: String(departmentCount) },
          { label: "Components", value: String(componentCount) },
          { label: "Modules in this build", value: String(installedCount) },
          { label: "Cross-department contracts", value: String(TREATIES.length) },
        ]}
      />

      {/* ---------------------------- the seven ---------------------------- */}
      <section className="flex flex-col gap-2">
        <p className="max-w-prose text-[12px] leading-[1.5] text-[var(--text-muted)]">
          <b className="text-[var(--text-secondary)]">In this build</b> is the module registry
          as installed. It is not filtered by what your company licensed or by what you
          personally may open — this page describes how the product is organised, not what is
          on your menu.
        </p>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {ordered.map((d) => (
            <DepartmentCard key={d.code} dept={d} modules={byCode.get(d.code) ?? []} />
          ))}
        </div>
      </section>

      {/* --------------------- why the lines are drawn --------------------- */}
      <section className="card">
        <div className="panel-h">
          <span>Why the lines are drawn here</span>
          <span className="panel-h-sub">System of record</span>
        </div>
        <div className="panel-b flex flex-col gap-2.5 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
          <p>
            Departments are cut by <b className="text-[var(--text-primary)]">who owns the record</b>
            . Whoever owns a fact owns the only code allowed to write it, and everybody else
            asks. Nothing is split by team size, by convenience, or by who happened to build
            it first.
          </p>
          <p>
            That is the same line the module boundaries in the code are drawn on. It is why{" "}
            <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
              POST /api/stock/entries
            </code>{" "}
            is the single write path to the stock ledger: Supply Chain owns the ledger, so
            Manufacturing asks for a movement rather than writing one. One owner, one write
            path, one place to look when a number is wrong.
          </p>
        </div>
      </section>

      {/* --------------------------- the treaties -------------------------- */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">
            Contracts between departments
          </h2>
          <p className="mt-1 max-w-prose text-[12px] leading-[1.5] text-[var(--text-muted)]">
            Every place two departments meet, and what each side has promised the other. The
            seams and the contracts are taken from the modules&rsquo; own boundary and event
            tables — each one is a real endpoint, event or port in the running system, not a
            description of one. The notes are those contracts put in plain words.
          </p>
        </div>
        <DataTable
          rows={TREATIES}
          columns={columns}
          rowKey={(t) => t.id}
          caption="Cross-department contracts: the seam, the contract that governs it, and why it exists"
        />
      </section>

      {/* ------------------------- the naming rules ------------------------ */}
      <section className="card">
        <div className="panel-h">
          <span>How the names work</span>
          <span className="panel-h-sub">Internal engineering identifiers</span>
        </div>
        <div className="panel-b flex flex-col gap-4">
          <ol className="flex flex-col gap-3">
            <Rule
              n="1"
              rule="Exactly four letters"
              why="Uniform length makes the seven read as one deliberate system rather than seven unrelated picks — and it fits a package prefix, a branch name, a ticket label and a chip on this page without ever being truncated."
            />
            <Rule
              n="2"
              rule="Mineral, geometric or industrial"
              why="Neutral, pronounceable in any market, and consistent with a precision-manufacturing product. Nothing that sounds like a mascot."
            />
            <Rule
              n="3"
              rule="The department's initial is its owner's initial"
              why="H, M, S, A, K and R are the initials of the people who own them, so the letter is the mnemonic for who to ask. ONYX is unconstrained, because a component is not one person's department."
            />
          </ol>

          {/* Not trivia. This is an engineering rule with a failure mode behind it. */}
          <div className="rounded-[var(--radius-card)] border border-[var(--gold-line)] bg-[var(--gold-soft)] p-3.5">
            <p className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--gold-ink)]">
              <Icons.TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              SPAR and RASP are anagrams
            </p>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
              Accepted knowingly, with one mitigation that is a hard rule rather than a
              preference: <b className="text-[var(--text-primary)]">neither is ever abbreviated</b>{" "}
              — not in code, package names, branch names or ticket titles. Always the full four
              letters. A shortened form of one is a shortened form of the other, and a
              misaddressed branch or ticket would go to the wrong department without anything
              looking wrong.
            </p>
          </div>

          <p className="text-[12px] leading-[1.55] text-[var(--text-muted)]">
            These seven are internal engineering identifiers — how the people who build this
            system refer to who owns what. They are not product branding, and nothing a
            customer buys is called by one of them.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------- pieces ---------------------------------- */

function DepartmentCard({
  dept,
  modules,
}: {
  dept: Department;
  /** What this build actually contains for this department, from the live registry. */
  modules: readonly ModuleManifest[];
}): React.JSX.Element {
  const isComponent = dept.component === true;

  // What became of each blueprint, answered by the spine against the live registry. The four
  // statuses are not interchangeable: `not_in_build` is a packaging decision, `not_written`
  // is unfinished work, and `unknown` claims nothing at all.
  const blueprints = dept.blueprints.map((b) => ({ ...b, status: blueprintStatus(b) }));
  const notInBuild = blueprints.filter((b) => b.status === "not_in_build").map((b) => b.file);
  const notWritten = blueprints.filter((b) => b.status === "not_written").map((b) => b.file);

  return (
    <article className="card flex flex-col">
      <div className="panel-h">
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon name={dept.icon} className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
          <span className="truncate">{dept.name}</span>
        </span>
        <Marker code={dept.code} />
      </div>
      <div className="panel-b flex flex-1 flex-col gap-3">
        {isComponent ? (
          // Said plainly and near the top, because it is the thing most often got wrong.
          // ONYX is horizontal: it serves the six and owns no business domain of its own,
          // which is precisely why it is a component and not a seventh department.
          <div>
            <span className="chip chip-violet">Component, not a department</span>
            <p className="mt-2 text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
              Horizontal. It serves modules inside the other departments and owns no business
              domain of its own — no customer, no order, no stock. That is exactly why it is a
              component: there is nothing here for it to be the system of record for.
            </p>
          </div>
        ) : null}

        <div>
          <p className="field-label">System of record for</p>
          <p className="text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">{dept.owns}</p>
        </div>

        <div>
          <p className="field-label">Blueprints — what it was specified to own</p>
          {blueprints.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-muted)]">
              No blueprint is registered against this department.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {blueprints.map((b) => (
                <span
                  key={b.file}
                  className={cn(
                    "chip font-[var(--font-mono)]",
                    b.status === "not_in_build" ? "chip-warn" : "chip-grey",
                    // Specified, not yet written. Struck rather than omitted: a card that
                    // listed it like any finished file would present a known hole as
                    // completed work.
                    b.status === "not_written" &&
                      "text-[var(--text-disabled)] line-through decoration-1",
                  )}
                  title={
                    b.status === "not_written"
                      ? `${b.file} is specified but has not been written`
                      : undefined
                  }
                >
                  {b.file}
                </span>
              ))}
            </div>
          )}
          {notWritten.length > 0 ? (
            <p className="mt-1.5 text-[11.5px] leading-[1.5] text-[var(--text-muted)]">
              {notWritten.join(", ")} — specified, not yet written.
            </p>
          ) : null}
        </div>

        <div className="mt-auto">
          <p className="field-label">In this build — what it actually contains</p>
          {modules.length === 0 ? (
            // Said plainly rather than left blank. An empty space reads as a rendering fault;
            // a sentence reads as an answer.
            <p className="text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
              No module from this department is part of this build.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {modules.map((m) => (
                <span key={m.key} className="chip chip-info" title={m.summary}>
                  {m.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {notInBuild.length > 0 ? (
          // The most useful sentence on the page. Anyone can claim a system is modular; this
          // is a named part of the specification that is simply not here, and nothing else in
          // the build refers to it.
          <p className="rounded-[var(--radius-control)] bg-[var(--warn-soft)] px-3 py-2 text-[11.5px] leading-[1.55] text-[var(--warn-ink)]">
            <b>{notInBuild.join(", ")}</b> is specified to this department and no module for it
            is in this build. It was left out by decision, not by accident, and nothing else
            here refers to it — which is what a module being genuinely removable looks like in
            practice.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Rule({ n, rule, why }: { n: string; rule: string; why: string }): React.JSX.Element {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[10.5px] font-bold text-[var(--brand)]">
        {n}
      </span>
      <span className="min-w-0">
        <b className="block text-[13px] font-semibold text-[var(--text-primary)]">{rule}</b>
        <span className="mt-0.5 block max-w-prose text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          {why}
        </span>
      </span>
    </li>
  );
}
