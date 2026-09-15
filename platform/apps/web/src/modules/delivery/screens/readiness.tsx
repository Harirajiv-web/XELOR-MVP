"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise } from "@spine/format";
import { StatusBadge } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  deliveryApi,
  DELIVERY_PAGE_SIZE,
  interoperabilityClaim,
  sourceSystemBound,
  type CompanyRow,
  type ConnectionRow,
  type ConnectorRow,
  type DataEnvelope,
  type ImportTargetsResponse,
} from "../api";
import { Bound, Fact, Field, NeverClaim, NotStored, Panel, Recorded, Stat } from "../evidence";

/**
 * READINESS — the discovery pack as a structured artefact.
 *
 * Discovery is the part of a delivery engagement that is always done and almost never
 * written down in a form anybody can audit six weeks later. What gets written down instead
 * is a proposal, which is a different document with a different purpose: a proposal argues,
 * a readiness pack records. When the project goes sideways in month two, the argument is
 * useless and the record is everything.
 *
 * Five sections, in the order a discovery visit actually runs, and a sixth that almost
 * nobody includes:
 *
 *   1. WHO IS ACCOUNTABLE on the customer's side, by name. Not "the plant".
 *   2. WHAT SYSTEMS EXIST, from the connector catalogue and the configured connections —
 *      read out of the platform rather than transcribed from a conversation, and annotated
 *      with what each adapter can and cannot be claimed to do.
 *   3. THE PAIN BASELINE — the numbers as they are today, before anything is changed.
 *   4. THE PILOT SCOPE, fixed, and expressed in terms of what can actually be migrated.
 *   5. STOP CRITERIA.
 *
 * STOP CRITERIA ARE THE PART EVERYONE OMITS, AND THE PART THAT PROTECTS BOTH SIDES.
 * An engagement with no agreed way to stop cannot be stopped without somebody being blamed,
 * so it is not stopped: it is extended, re-scoped and quietly written off. Naming the
 * conditions in advance — while everyone is still optimistic — is what makes an early exit
 * a decision rather than a failure. It protects the customer from paying for a project that
 * is not working and it protects the delivery team from being held to a scope that turned
 * out to rest on data nobody has.
 *
 * WHAT IS REAL ON THIS SCREEN AND WHAT IS NOT. The company register, the connector
 * catalogue, the configured connections and the migration targets are records, read from
 * endpoints named beside each. Everything else — the sponsor, the baseline figures, the
 * scope boundary, the stop criteria — is a structure to fill in and is marked as such. This
 * module has no table for a readiness pack and does not create one.
 */
export default function ReadinessScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const companies = useCursorList<CompanyRow>(deliveryApi.companiesPath, {
    limit: DELIVERY_PAGE_SIZE,
  });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return companies.rows;
    return companies.rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.gstin?.toLowerCase().includes(q) ?? false),
    );
  }, [companies.rows, filter]);

  const columns: ReadonlyArray<Column<CompanyRow>> = [
    { key: "code", header: "Code", width: "w-32", render: (c) => <span className="font-semibold">{c.code}</span> },
    { key: "name", header: "Legal entity", render: (c) => c.name },
    {
      key: "gstin",
      header: "GSTIN",
      width: "w-56",
      render: (c) =>
        c.gstin ? (
          <span className="font-[var(--font-mono)] text-[12px]">{c.gstin}</span>
        ) : (
          <span className="text-[var(--text-muted)]">Not on record</span>
        ),
    },
    {
      key: "createdAt",
      header: "On record since",
      width: "w-36",
      render: (c) => <span className="text-[var(--text-secondary)]">{date(c.createdAt)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Discovery & readiness pack"
        subtitle="The engagement's opening record: who is accountable, what systems exist, the baseline before anything changes, the fixed pilot scope, and the conditions under which this stops."
        meta={[
          { label: "Entities on record", value: String(companies.rows.length) },
          { label: "Pack status", value: "Structure only — not stored" },
        ]}
      />

      <NotStored
        what="The readiness pack itself"
        where="the signed engagement letter and the discovery minutes"
      >
        <p>
          The registers below <strong>are</strong> records and are labelled with where each
          came from. The blanks are prompts to be read out in the discovery meeting and
          written into a document that binds — this screen is the agenda, not the agreement.
        </p>
      </NotStored>

      {/* ------------------------------ 1. Sponsor ----------------------------- */}

      <Panel
        title="1 · The accountable sponsor"
        lede="One named person on the customer's side who can decide, and one on ours. Not a department."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Customer sponsor (name, role, and what they can decide alone)"
            instruction="A sponsor who has to consult somebody else for every decision is a messenger. Write the decisions they can take without a meeting: scope changes under a stated value, data sign-off, go-live date."
          />
          <Field
            label="Delivery lead (name, and the hours they are actually available)"
            instruction="The real figure, not the aspiration. A lead who is on two other engagements is on two other engagements, and saying so now costs an awkward sentence rather than a missed date."
          />
          <Field
            label="Who signs off migrated data as correct"
            instruction="Usually not the sponsor. It is the storekeeper for stock, the accountant for balances. Name them per data set — a single blanket sign-off is one nobody reads."
          />
          <Field
            label="Escalation path when those two disagree"
            instruction="Named, on both sides, with the time it takes to reach them. An escalation path discovered during the first dispute is not a path."
          />
        </div>
        <Recorded source="Nothing on this panel is read from a record — the platform has no sponsor register." />
      </Panel>

      {/* -------------------------- 2. Entity register ------------------------- */}

      <Panel
        title="2a · Legal entities and sites on record"
        lede="The companies this platform already knows about. The engagement scope names some subset of these — or names one that has to be created first."
      >
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, code or GSTIN…"
            aria-label="Filter legal entities"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          loading={companies.loading}
          loadingMore={companies.loadingMore}
          error={companies.error}
          hasMore={companies.hasMore}
          onLoadMore={companies.loadMore}
          onReload={companies.reload}
          rowKey={(c) => c.id}
          caption="Legal entities on record, with code, name and GSTIN"
          empty={
            <Empty
              title="No legal entity is on record yet"
              body="An engagement cannot be scoped against an entity that does not exist. Creating the company is step one of setup, and it is a general-ledger decision rather than a delivery one — it determines which books the transactions land in."
            />
          }
        />
        <Recorded source="read from /general/companies (general.company.read)" />
      </Panel>

      {/* ------------------------- 2b. Systems register ------------------------ */}

      {can("integration.connector.read") ? (
        <SystemsRegister />
      ) : (
        <Panel
          title="2b · Systems and asset register"
          lede="The adapters this build contains, and which of them are configured here."
        >
          <p className="text-[13px] text-[var(--text-secondary)]">
            This section needs <code className="font-[var(--font-mono)]">integration.connector.read</code>.
            The discovery pack can be completed without it, but the systems register then has
            to be transcribed by hand from the customer's own inventory — which is how a
            source system that nobody mentioned is discovered during migration week.
          </p>
        </Panel>
      )}

      {/* ---------------------------- 3. Pain baseline ------------------------- */}

      <Panel
        title="3 · The pain baseline, measured before anything changes"
        lede="Figures as they are today. Taken now, or the improvement can never be evidenced and the renewal conversation becomes an argument about impressions."
      >
        <Bound>
          <p>
            <strong>Take the baseline before go-live or do not claim an improvement.</strong>{" "}
            After cut-over the old numbers exist only in somebody's memory, and memory moves
            in whichever direction makes the present look better. Each figure below should be
            captured with its source and its date, from the customer's current system or a
            counted sample — not estimated in the meeting.
          </p>
        </Bound>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Order-to-dispatch lead time, today"
            instruction="Median and worst case over the last 90 days, from the customer's own records. A mean hides the tail, and the tail is what the customer is actually complaining about."
          />
          <Field
            label="Stock accuracy at the last physical count"
            instruction="Lines counted, lines matching, and the value of the difference. If there has been no count, write 'unknown' — that is itself a finding and usually a large one."
          />
          <Field
            label="Hours per week spent re-keying between systems"
            instruction="Ask who does it and for how long, per task. This is the figure that most often justifies a connector, and it is the one most often quoted from a guess."
          />
          <Field
            label="Month-end close: elapsed days, and what holds it up"
            instruction="The blocking step, named. Closing faster is a common promise; it is only deliverable if the thing that blocks it is in scope."
          />
          <Field
            label="Documented late-delivery or rejection rate"
            instruction="From the customer's own records, with the period stated. A rate with no denominator is a number, not a measurement."
          />
          <Field
            label="Where the data currently lives, and who holds the passwords"
            instruction="Spreadsheets on a named machine, a Tally licence on one desktop, an ERP whose vendor support lapsed. Access has to be arranged before migration week, not during it."
          />
        </div>
        <Recorded source="Nothing on this panel is read from a record — these are the customer's current-state figures, and this platform has none of them until after cut-over." />
      </Panel>

      {/* ----------------------------- 4. Pilot scope -------------------------- */}

      <PilotScope canReadTargets={can("integration.flow.read")} />

      {/* ---------------------------- 5. Stop criteria ------------------------- */}

      <Panel
        title="5 · Stop criteria — agreed now, while everyone is optimistic"
        lede="The conditions under which this engagement stops, pauses or is re-scoped, decided before there is anything to defend."
      >
        <NotStored
          what="The stop criteria"
          where="the signed engagement letter, as a numbered clause each side can point at"
        >
          <p>
            Agreeing these in the first week is what makes an early exit a decision rather
            than a failure. An engagement with no agreed way to stop is not stopped when it
            should be — it is extended, re-scoped, and eventually written off by whoever has
            least to lose.
          </p>
        </NotStored>

        <div className="grid gap-3 md:grid-cols-2">
          {STOP_CRITERIA.map((criterion) => (
            <Field
              key={criterion.label}
              label={criterion.label}
              instruction={criterion.instruction}
            >
              <strong className="text-[var(--text-secondary)]">If it is breached: </strong>
              {criterion.consequence}
            </Field>
          ))}
        </div>

        <Disclosure title="Why a stop criterion needs a consequence, not just a threshold">
          <p>
            A threshold with no stated consequence is a warning, and a warning is what gets
            noted in the minutes and then absorbed. The consequence is what makes the
            threshold load-bearing: this milestone moves, this invoice is not raised, this
            phase does not begin. Each one should name who does the thing, because a
            consequence with no owner is another warning.
          </p>
          <p className="mt-2">
            The consequences are deliberately symmetric. A criterion that can only ever cost
            the customer money will not be agreed to, and one that can only ever cost the
            delivery team will be quietly ignored at the first test.
          </p>
        </Disclosure>
      </Panel>

      <NeverClaim
        claim="the discovery confirmed we can integrate with their systems"
        because="Discovery confirms which systems exist and who owns them. Whether this platform can exchange records with a particular installation of SAP, Tally, Odoo or Dynamics is settled by putting the customer's own data through the connection and reconciling it — and until that has happened, the honest sentence is that it is in scope to find out."
      />
    </div>
  );
}

/* ========================================================================== */
/* The systems register — real rows, annotated with what may be claimed.       */
/* ========================================================================== */

function SystemsRegister(): React.JSX.Element {
  const connectors = useQuery<DataEnvelope<ConnectorRow>>(deliveryApi.connectorsPath);
  const connections = useQuery<DataEnvelope<ConnectionRow>>(deliveryApi.connectionsPath);

  const connectorRows = connectors.data?.data ?? [];
  const connectionRows = connections.data?.data ?? [];
  const configured = new Map<string, ConnectionRow[]>();
  for (const row of connectionRows) {
    const list = configured.get(row.connector) ?? [];
    list.push(row);
    configured.set(row.connector, list);
  }
  const live = connectionRows.filter((c) => c.adapterMode === "live").length;
  const fixtures = connectionRows.filter((c) => c.adapterMode === "fake").length;

  const columns: ReadonlyArray<Column<ConnectorRow>> = [
    {
      key: "code",
      header: "Adapter",
      width: "w-56",
      render: (row) => (
        <div>
          <strong className="text-[var(--text-primary)]">{row.name}</strong>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">{row.code}</div>
        </div>
      ),
    },
    {
      key: "shape",
      header: "Category & protocol",
      width: "w-48",
      render: (row) => (
        <div className="text-[var(--text-secondary)]">
          {humanise(row.category)}
          <div className="text-[11px] text-[var(--text-muted)]">
            {row.protocol} · {humanise(row.direction)}
          </div>
        </div>
      ),
    },
    {
      key: "configured",
      header: "Configured here",
      width: "w-52",
      render: (row) => {
        const instances = configured.get(row.code) ?? [];
        if (instances.length === 0) {
          return (
            <span className="text-[var(--text-muted)]">
              Catalogued, not configured — nothing has been connected to it
            </span>
          );
        }
        return (
          <div className="flex flex-col gap-1">
            {instances.map((instance) => {
              const claim = interoperabilityClaim(instance.adapterMode);
              return (
                <div key={instance.name}>
                  <span className="font-semibold text-[var(--text-primary)]">{instance.name}</span>
                  <StatusBadge
                    className="ml-1.5"
                    tone={instance.adapterMode === "fake" ? "draft" : "progress"}
                    label={claim.label}
                  />
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "bound",
      header: "What may be claimed about it",
      render: (row) => {
        const instances = configured.get(row.code) ?? [];
        const bound = sourceSystemBound(row.code, row.category);
        const first = instances[0];
        return (
          <div className="space-y-1.5 text-[var(--text-secondary)]">
            {first ? <p>{interoperabilityClaim(first.adapterMode).claim}</p> : null}
            {bound ? (
              <p className="text-[var(--text-primary)]">
                <strong>Bound: </strong>
                {bound}
              </p>
            ) : null}
            {!first && !bound ? (
              <p className="text-[var(--text-muted)]">
                Nothing is configured against this adapter, so nothing about the customer's
                system can be claimed from it.
              </p>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <Panel
      title="2b · Systems and asset register"
      lede="The adapters this build actually contains, which of them are configured, and — for each — the sentence that may honestly be said about it."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Adapters catalogued"
          value={String(connectorRows.length)}
          hint="Present in this build. A catalogue entry is code that exists, not a system that has been integrated with."
        />
        <Stat
          label="Configured live"
          value={String(live)}
          hint="Pointed at a real endpoint. Still not proof that the customer's records have travelled through it."
        />
        <Stat
          label="Local fixtures"
          value={String(fixtures)}
          hint="Fake-adapter connections. They exercise the whole pipeline without anything leaving the building."
        />
      </div>

      <NeverClaim
        claim="we support SAP, Tally, Odoo and Dynamics"
        because="A catalogue containing a name is not compatibility with an installation. Each adapter is deliberately bounded — Tally stock is a book balance rather than available-to-promise stock, an SAP adapter covers only the documents it was built for, Odoo and Dynamics are routinely customised per deployment. Surface the bound in the row and scope it against the customer's own system."
      />

      <DataTable
        rows={connectorRows}
        columns={columns}
        loading={connectors.loading || connections.loading}
        error={connectors.error ?? connections.error}
        onReload={() => {
          connectors.reload();
          connections.reload();
        }}
        rowKey={(row) => row.code}
        caption="Connector catalogue with configured instances and the claims each supports"
        empty={
          <Empty
            title="No adapter is catalogued in this build"
            body="Nothing can be integrated until a connector exists. That is an engineering item rather than a delivery one — record it in scope as a build, with its own estimate, rather than as a configuration task."
          />
        }
      />
      <Recorded source="read from /integration/connectors and /integration/connections (integration.connector.read)" />
    </Panel>
  );
}

/* ========================================================================== */
/* The pilot scope — bounded by what can genuinely be migrated.                */
/* ========================================================================== */

function PilotScope({ canReadTargets }: { canReadTargets: boolean }): React.JSX.Element {
  const targets = useQuery<ImportTargetsResponse>(
    canReadTargets ? deliveryApi.importTargetsPath : null,
  );
  const rows = targets.data?.targets ?? [];

  return (
    <Panel
      title="4 · The fixed pilot scope"
      lede="One line, one shift, one product family, one month — and a written list of what is deliberately outside it."
    >
      <Bound>
        <p>
          <strong>A pilot that can grow is not a pilot.</strong> The scope is fixed at the
          start and changes only by a written variation, because the alternative — absorbing
          "while you're in there" requests — is how a six-week pilot becomes a nine-month
          implementation that nobody agreed to buy and nobody can evidence the value of.
        </p>
      </Bound>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="In scope: the line, shift, product family and period"
          instruction="Narrow enough that a single person can hold all of it, and real enough that the result means something. One assembly line for one month beats three departments for a fortnight."
        />
        <Field
          label="Explicitly out of scope"
          instruction="Written as a list, not implied by omission. Payroll, statutory filing, a second plant, the customer's own reporting suite — anything a reasonable person might have assumed was included."
        />
        <Field
          label="What is being migrated, and what is being left behind"
          instruction="Opening balances only, or history too? History is where migration effort actually goes, and 'we'll bring the last three years across' is a sentence that has ended more pilots than any technical problem."
        />
        <Field
          label="The single success measure, and who will read it"
          instruction="One number, compared against the baseline in section 3, on a stated date. Several measures means the result can always be argued either way."
        />
      </div>

      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
        What this build can actually migrate today
      </h3>
      {!canReadTargets ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          The migration target list needs{" "}
          <code className="font-[var(--font-mono)]">integration.flow.read</code>. Without it,
          scope has to be written against an assumption about what is importable — which is
          the assumption that fails in migration week.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          {targets.loading
            ? "Reading the migration targets…"
            : "No migration target is available in this build. Every master would have to be entered by hand, which is a scope item with a real cost — count the rows and price the typing rather than treating it as setup."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[40rem]">
              <caption className="sr-only">
                Migration targets available in this build, with the record each row becomes
              </caption>
              <thead>
                <tr>
                  <th scope="col">Target</th>
                  <th scope="col">One row becomes</th>
                  <th scope="col">Required fields the customer must supply</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((target) => {
                  const required = target.fields.filter((f) => f.required);
                  return (
                    <tr key={target.key}>
                      <td>
                        <strong>{target.label}</strong>
                        <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                          {target.key}
                        </div>
                      </td>
                      <td>{target.creates}</td>
                      <td>
                        {required.length === 0 ? (
                          <span className="text-[var(--text-muted)]">None mandatory</span>
                        ) : (
                          <span>{required.map((f) => f.label).join(" · ")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Recorded source="read from /dataimport/targets (integration.flow.read) — the same specification the server validates rows against, so the scope list and the import rules cannot drift apart" />
        </>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label="Anything not on that list">
          is either entered by hand — count the rows and price it — or needs a connector
          built, which is an engineering estimate rather than a configuration task.
        </Fact>
        <Fact label="A required field the customer does not hold">
          is a data-cleanup work package with its own owner and its own date, and it belongs
          in the plan before go-live rather than in the first week after it.
        </Fact>
      </dl>
    </Panel>
  );
}

/* ========================================================================== */
/* The stop criteria. Fixed wording, because the wording is the protection.    */
/* ========================================================================== */

interface StopCriterion {
  label: string;
  instruction: string;
  consequence: string;
}

/**
 * Six criteria, each with a threshold AND a consequence.
 *
 * Chosen because each is objectively checkable by one side without the other's cooperation.
 * A criterion that needs both parties to agree it has been met is not a stop criterion; it
 * is a negotiation, and it will be held during precisely the week when neither side is
 * feeling reasonable.
 */
const STOP_CRITERIA: readonly StopCriterion[] = [
  {
    label: "Data quality below the agreed floor",
    instruction:
      "State the floor as a percentage of rows that must pass validation on the trial import, per data set, with the date of the trial. The reconciliation report on the migration screen produces exactly this figure.",
    consequence:
      "Go-live moves until the customer's data owner has corrected it. The delivery team does not clean the data silently — that hides the size of the problem and creates a cleanup nobody has budgeted for.",
  },
  {
    label: "Source-system access not granted by a stated date",
    instruction:
      "Name the systems, the credentials required, and the date. Access is a customer task and it is the most common cause of a slipped migration week.",
    consequence:
      "The integration work package is suspended and re-planned, and the cost of the idle window is stated in writing at the time rather than argued about at invoicing.",
  },
  {
    label: "The named sponsor becomes unavailable",
    instruction:
      "Define unavailable concretely: no decision within N working days, twice. Vagueness here is how a project drifts for a month before anybody says the word.",
    consequence:
      "Work pauses at the current milestone. It does not continue on assumptions — assumptions made during a sponsor's absence are the ones that get rejected on their return.",
  },
  {
    label: "Scope growth beyond a stated threshold",
    instruction:
      "A percentage or an absolute value of added work, counted in writing from the first day. Small additions are individually reasonable, which is exactly why they need a running total.",
    consequence:
      "A written variation, re-estimated and re-approved by both sponsors, before any of it is started. Not absorbed, and not started 'while we wait for the paperwork'.",
  },
  {
    label: "The pilot success measure is not met",
    instruction:
      "The single number from section 4, on the stated date, compared against the baseline in section 3. Agreed in advance so it cannot be reinterpreted afterwards.",
    consequence:
      "The engagement stops at the pilot boundary and the findings are written up honestly. This is the criterion that protects the customer from paying for a rollout of something that did not work.",
  },
  {
    label: "An infrastructure or connectivity precondition proves false",
    instruction:
      "Network to the shop floor, a machine that turns out to have no data interface, a server that does not exist. Each precondition is listed with how it was verified — 'confirmed verbally' is not verified.",
    consequence:
      "That work package is removed from scope and re-priced, including any hardware. A precondition that was wrong is a costing error, not a delivery failure, and treating it as the latter is how delivery teams end up absorbing capital equipment.",
  },
];
