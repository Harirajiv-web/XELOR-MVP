"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { Disclosure } from "@spine/ui/disclosure";
import { StatusBadge } from "@spine/ui/status-badge";
import { useAccess } from "@spine/access/permissions";
import { inr, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  deliveryApi,
  type ConnectionRow,
  type ConnectorRow,
  type DataEnvelope,
  type FactoryIntegrationView,
  type ImportTargetsResponse,
} from "../api";
import { Bound, Fact, Field, NeverClaim, NotStored, Panel, Recorded, Stat } from "../evidence";

/**
 * COMMERCIAL SHAPE — how this engagement is priced, and the arithmetic nobody should trust.
 *
 * The commercial structure is part of the product rather than an afterthought bolted on by
 * whoever writes the proposal. Getting it wrong has a characteristic failure: a modest
 * software subscription is quoted, the installation and the support labour behind it are
 * absorbed as "part of onboarding", and the engagement loses money from the first month while
 * everybody involved believes it is profitable.
 *
 * ---------------------------------------------------------------------------
 * THE SCOPE RULE, WHICH IS THE WHOLE POINT OF THIS SCREEN
 * ---------------------------------------------------------------------------
 * A SMALL MODULE CAN CARRY A SUBSTANTIAL INSTALLATION OR SUPPORT COST. The size of the
 * software has almost no relationship to the cost of getting it live: one screen that reads a
 * machine signal can require a site survey, a panel, a cable run, an electrician, a shutdown
 * window and a commissioning visit. The seven lines below are separated for exactly that
 * reason — collapse them into one number and the expensive ones become invisible, because
 * they are invisible in the software.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ROI PANEL IS DELIBERATELY UNCOMFORTABLE TO USE
 * ---------------------------------------------------------------------------
 * Every input starts EMPTY and every one must be replaced with the customer's own evidence.
 * A calculator pre-filled with plausible industry figures produces a plausible number, and a
 * plausible number in a proposal becomes a promise — it gets quoted back during the renewal
 * conversation by somebody who has forgotten it was an illustration, and there is no good
 * answer at that point.
 *
 * So: illustrative arithmetic over inputs the customer supplied, shown with its workings,
 * never a forecast. If the customer has no baseline, the honest output is "we cannot estimate
 * this yet" — which is also the strongest argument for taking the baseline in discovery.
 *
 * Nothing on this screen is stored. There is no pricing table, no quote record and no rate
 * card in this platform, and this module does not create one.
 */
export default function CommercialScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const connectors = useQuery<DataEnvelope<ConnectorRow>>(
    can("integration.connector.read") ? deliveryApi.connectorsPath : null,
  );
  const connections = useQuery<DataEnvelope<ConnectionRow>>(
    can("integration.connector.read") ? deliveryApi.connectionsPath : null,
  );
  const targets = useQuery<ImportTargetsResponse>(
    can("integration.flow.read") ? deliveryApi.importTargetsPath : null,
  );
  const factory = useQuery<FactoryIntegrationView>(
    can("integration.factory-connect.read") ? deliveryApi.factoryViewPath : null,
  );

  const connectorCount = connectors.data?.data.length ?? null;
  const connectionCount = connections.data?.data.length ?? null;
  const targetCount = targets.data?.targets.length ?? null;
  const gatewayCount = factory.data?.gateways.length ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Commercial shape"
        subtitle="The seven lines this engagement is priced on, what belongs in one-time versus monthly, and an illustrative payback calculation whose every input must be replaced with the customer's own evidence."
        meta={[
          { label: "Pricing lines", value: String(ONE_TIME.length + RECURRING.length) },
          { label: "Stored here", value: "Nothing" },
        ]}
      />

      <NotStored
        what="Everything on this screen — prices, rates, quantities and the calculation"
        where="the quotation and the signed order, priced by whoever owns the rate card"
      >
        <p>
          There is no pricing table, no quote record and no rate card in this platform, and
          this module does not create one. What follows is the structure an estimate needs and
          the counts the platform can genuinely supply to anchor it.
        </p>
      </NotStored>

      <Bound>
        <p>
          <strong>
            Scope rule: a small module can carry a substantial installation or support cost.
          </strong>{" "}
          The size of the software is a poor predictor of the cost of getting it live. One
          screen reading one machine signal can need a site survey, a panel, a cable run, an
          electrician, a shutdown window and a commissioning visit — none of which is visible
          in the software and all of which is visible in the invoice. Price the seven lines
          separately or the expensive ones disappear.
        </p>
      </Bound>

      {/* ------------------------- the seven lines ----------------------------- */}

      <Panel
        title="The seven lines, priced separately"
        lede="Separated because they have different cost drivers, different risk and — often — different payers."
      >
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[48rem]">
            <caption className="sr-only">
              The seven commercial lines with their cost driver and the risk of merging each
            </caption>
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">What drives the cost</th>
                <th scope="col">What goes wrong if it is merged into another line</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_LINES.map((line) => (
                <tr key={line.line}>
                  <td>
                    <strong>{line.line}</strong>
                    <div className="mt-1">
                      <StatusBadge
                        tone={line.cadence === "One-time" ? "progress" : "pending"}
                        label={line.cadence}
                      />
                    </div>
                  </td>
                  <td>{line.driver}</td>
                  <td className="text-[var(--text-secondary)]">{line.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Disclosure title="Why the diagnostic and the pilot are priced apart from implementation">
          <p>
            A paid diagnostic is the only version of discovery that both sides take seriously.
            Free discovery is scheduled around billable work, produces a proposal rather than a
            record, and gives the customer no reason to make their data available. Priced
            separately, it also gives both sides a clean place to stop — which is what the stop
            criteria on the readiness pack are for.
          </p>
          <p className="mt-2">
            It also protects the implementation estimate. An implementation priced before
            anybody has seen the customer's data is priced on assumptions, and the variance
            lands on whoever wrote the number.
          </p>
        </Disclosure>
      </Panel>

      {/* ------------------------ one-time / monthly --------------------------- */}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="One-time"
          lede="Everything that happens once to get this live. Each is people or equipment, not software."
        >
          <ul className="space-y-2">
            {ONE_TIME.map((item) => (
              <li
                key={item.item}
                className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3"
              >
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.item}</p>
                <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
                  {item.note}
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Monthly"
          lede="Everything that recurs. The labour lines are the ones most often forgotten and the ones that decide whether this is profitable."
        >
          <ul className="space-y-2">
            {RECURRING.map((item) => (
              <li
                key={item.item}
                className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3"
              >
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.item}</p>
                <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
                  {item.note}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ---------------------- quantities from real records ------------------- */}

      <Panel
        title="Quantities the platform can supply"
        lede="Counts read from real records, so the estimate is at least anchored to what exists rather than to a guess."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Adapters in this build"
            value={connectorCount === null ? "—" : String(connectorCount)}
            hint="Catalogued connectors. An integration the customer needs that is NOT on this list is a build, with an engineering estimate rather than a configuration fee."
          />
          <Stat
            label="Connections configured"
            value={connectionCount === null ? "—" : String(connectionCount)}
            hint="Each configured instance carries its own setup, credential handling and ongoing operations cost. Per-connection pricing follows this count, not the adapter count."
          />
          <Stat
            label="Migratable masters"
            value={targetCount === null ? "—" : String(targetCount)}
            hint="Import targets available. Anything outside this list is keyed by hand — count the rows and price the typing rather than absorbing it."
          />
          <Stat
            label="Edge gateways"
            value={gatewayCount === null ? "—" : String(gatewayCount)}
            hint="Installed gateways. Each carries hardware, installation labour and a commissioning visit — the line that most often dwarfs the software."
          />
        </div>
        <Recorded source="counts read from /integration/connectors, /integration/connections, /dataimport/targets and /integration/factory/views/integration. A dash means the permission for that endpoint is not held, not that the count is zero." />
        <Bound>
          <p>
            <strong>A count is a quantity, not a price.</strong> The platform can say how many
            connections exist; it holds no rate for configuring one, no labour standard and no
            regional variation. Multiplying these counts by a remembered figure is how an
            estimate acquires false precision.
          </p>
        </Bound>
      </Panel>

      {/* ----------------------------- the ROI panel --------------------------- */}

      <IllustrativePayback />

      {/* ------------------------- what has to be agreed ----------------------- */}

      <Panel
        title="What has to be written down before this is quoted"
        lede="The five questions whose absence produces the disputes."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {COMMERCIAL_FIELDS.map((item) => (
            <Field key={item.label} label={item.label} instruction={item.instruction} />
          ))}
        </div>
      </Panel>

      <NeverClaim
        claim="the system pays for itself in N months"
        because="That is a forecast, and nothing here can produce one. The arithmetic above multiplies figures somebody typed in; it contains no model of this plant, no allowance for the change taking hold, and no evidence that the saving will be realised rather than absorbed. Present it as arithmetic over the customer's own inputs, shown with its workings, and let them decide what it is worth."
      />

      <NeverClaim
        claim="partner installation is included at this rate"
        because="Companies identified in research are candidate options. None has been contacted, none has quoted and none has agreed a rate or a response time. A partner-coverage line in a monthly price is an estimate against an unarranged supplier, and it should be labelled as one until somebody has signed."
      />
    </div>
  );
}

/* ========================================================================== */
/* The payback panel. Empty by default, on purpose.                            */
/* ========================================================================== */

/** Read a positive number out of an input, or null when it is blank or unusable. */
function positive(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function IllustrativePayback(): React.JSX.Element {
  const [oneTime, setOneTime] = useState("");
  const [monthly, setMonthly] = useState("");
  const [hoursSaved, setHoursSaved] = useState("");
  const [hourlyCost, setHourlyCost] = useState("");

  const result = useMemo(() => {
    const capital = positive(oneTime);
    const run = positive(monthly);
    const hours = positive(hoursSaved);
    const rate = positive(hourlyCost);
    if (capital === null || run === null || hours === null || rate === null) return null;

    // Weeks per month as 52/12, not 4. Four weeks a month understates a year by a month, and
    // the error runs in the flattering direction — which is the direction to be suspicious of.
    const monthlySaving = hours * (52 / 12) * rate;
    const netMonthly = monthlySaving - run;
    if (netMonthly <= 0) {
      return {
        monthlySaving,
        netMonthly,
        months: null as number | null,
        note: "On these inputs the monthly saving does not cover the monthly cost, so there is no payback at all. That is a legitimate answer and it is more useful now than after the order.",
      };
    }
    return {
      monthlySaving,
      netMonthly,
      months: capital / netMonthly,
      note: "Arithmetic over the four figures above, with no model of this plant and no allowance for the change taking hold. It is a sum, not a prediction.",
    };
  }, [oneTime, monthly, hoursSaved, hourlyCost]);

  return (
    <Panel
      title="Illustrative payback — every input replaceable with customer evidence"
      lede="Deliberately empty. A calculator pre-filled with plausible figures produces a plausible number, and a plausible number in a proposal becomes a promise."
    >
      <div className="x-notice" data-tone="warning">
        <div>
          <p>
            <strong>Illustrative arithmetic. Not a forecast, not a business case.</strong> Each
            figure below must be replaced with evidence the customer supplied — from their own
            records, with the period and source stated. Where they have no baseline, the honest
            output is that this cannot be estimated yet, which is itself the argument for
            taking the baseline during discovery.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NumberInput
          id="delivery-roi-onetime"
          label="One-time cost (₹)"
          hint="Discovery, configuration, data cleanup, integration, installation and training — the whole first-line total."
          value={oneTime}
          onChange={setOneTime}
        />
        <NumberInput
          id="delivery-roi-monthly"
          label="Monthly cost (₹)"
          hint="Hosting and licences, support labour, monitoring and any partner coverage. Labour included, or this understates."
          value={monthly}
          onChange={setMonthly}
        />
        <NumberInput
          id="delivery-roi-hours"
          label="Hours saved per week"
          hint="From the discovery baseline — who does the task now and for how long. Counted, not estimated in the meeting."
          value={hoursSaved}
          onChange={setHoursSaved}
        />
        <NumberInput
          id="delivery-roi-rate"
          label="Fully loaded cost per hour (₹)"
          hint="The customer's figure, including on-costs. A bare salary rate understates by a third or more and the error flatters us."
          value={hourlyCost}
          onChange={setHourlyCost}
        />
      </div>

      {result === null ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          Nothing is calculated until all four figures are supplied. There are no defaults, and
          that is deliberate — a default here would be a number this module invented that
          somebody later quotes as ours.
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact label="Gross monthly saving">
              {inr(result.monthlySaving)}
              <div className="text-[11px] text-[var(--text-muted)]">
                hours × 52/12 weeks × loaded rate
              </div>
            </Fact>
            <Fact label="Net of the monthly cost">
              {inr(result.netMonthly)}
              <div className="text-[11px] text-[var(--text-muted)]">
                gross saving − monthly cost
              </div>
            </Fact>
            <Fact label="Simple payback">
              {result.months === null
                ? "None on these inputs"
                : `${num(result.months, 1)} months`}
              <div className="text-[11px] text-[var(--text-muted)]">
                one-time ÷ net monthly, undiscounted
              </div>
            </Fact>
          </dl>
          <p className="text-[12px] leading-[1.6] text-[var(--text-secondary)]">{result.note}</p>
        </>
      )}

      <Disclosure title="What this arithmetic deliberately leaves out, and why saying so is the point">
        <p>
          It ignores the time value of money, the customer's own effort during
          implementation, the productivity dip every change causes in its first weeks, and
          whether the hours saved are actually removed from the cost base or simply spent on
          something else — which, for a salaried team, is usually what happens. A saving that
          does not reduce a cost is a benefit, not a return.
        </p>
        <p className="mt-2">
          It is presented anyway because a customer will do this sum regardless, and doing it
          together with the assumptions visible is better than them doing it privately with
          worse ones. What must not happen is this number leaving the room as a commitment.
        </p>
      </Disclosure>

      <Recorded source="Nothing here is read from or written to any record. The inputs live in this browser tab and are gone when it closes." />
    </Panel>
  );
}

function NumberInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="—"
        className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-3 text-[13px] tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
      />
      <p className="text-[11px] leading-[1.6] text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

/* ========================================================================== */

interface PricingLine {
  line: string;
  cadence: "One-time" | "Monthly";
  driver: string;
  risk: string;
}

const PRICING_LINES: readonly PricingLine[] = [
  {
    line: "Diagnostic / pilot",
    cadence: "One-time",
    driver: "Days on site, systems examined, data samples taken.",
    risk: "Given away, it is scheduled around billable work and produces a proposal rather than a record — and the implementation that follows is priced on assumptions nobody verified.",
  },
  {
    line: "Implementation",
    cadence: "One-time",
    driver: "Configuration, data cleanup, training and the number of people being changed.",
    risk: "Bundled into the subscription, it turns a multi-week effort into an amortised line that makes the first year look profitable and the payback look faster than it is.",
  },
  {
    line: "Hardware & installation",
    cadence: "One-time",
    driver: "Gateways, panels, cabling, electrical work, shutdown windows, travel.",
    risk: "Absorbed into a software price, this is the line that turns a sold engagement into a loss-making one. It is also the least software-like and the easiest to under-scope from a desk.",
  },
  {
    line: "Software subscription",
    cadence: "Monthly",
    driver: "Modules licensed, named seats, term.",
    risk: "Quoted alone, it anchors the customer on a number that is a fraction of the real cost, and every other line then reads as an add-on they were not expecting.",
  },
  {
    line: "Connectors",
    cadence: "Monthly",
    driver: "Number of configured connections, statutory or not, and how often each is exercised.",
    risk: "Included by default, this becomes an unbounded commitment: every new system the customer buys later is expected to be connected for free.",
  },
  {
    line: "Cloud usage",
    cadence: "Monthly",
    driver: "Storage, egress, retention floors, the number of events actually flowing.",
    risk: "Treated as fixed, it grows with the customer's success and is discovered during a renewal rather than budgeted for.",
  },
  {
    line: "Support",
    cadence: "Monthly",
    driver: "Coverage hours, severity targets, named people, and any partner coverage on site.",
    risk: "Costed as a percentage of licence value rather than as the labour it is, it fails on the first out-of-hours commitment — and the out-of-hours commitment is the one that gets sold.",
  },
];

const ONE_TIME: readonly { item: string; note: string }[] = [
  {
    item: "Discovery",
    note: "The readiness pack: sponsor, systems register, baseline, fixed scope and stop criteria. Days on site, not a phone call.",
  },
  {
    item: "Configuration",
    note: "Company, sites, masters, workflows, roles and permissions. Driven by the number of distinct ways this customer works rather than by the module count.",
  },
  {
    item: "Data cleanup",
    note: "The largest and least predictable line. Priced against a sample from the customer's actual file, never against a general assumption about spreadsheet quality.",
  },
  {
    item: "Integration",
    note: "Per connection, not per adapter. A catalogued connector still needs credentials, mapping, a reconciliation and a rehearsed failure path.",
  },
  {
    item: "Installation",
    note: "Hardware, cabling, electrical work, shutdown windows, travel and a commissioning visit. The line that dwarfs the software on any shop-floor scope.",
  },
  {
    item: "Training",
    note: "Per role and per shift — and priced to include the second cohort, because the first one includes people who will have left within a year.",
  },
];

const RECURRING: readonly { item: string; note: string }[] = [
  {
    item: "Hosting and licences",
    note: "Infrastructure and third-party software. The only line that behaves like a product cost.",
  },
  {
    item: "Support labour",
    note: "Named people, for named hours, paid for being available. This is a wage bill, and costing it as a percentage of licence value is how an unstaffable commitment gets signed.",
  },
  {
    item: "Monitoring",
    note: "Somebody looking, on a schedule, with somewhere to escalate. A dashboard that nobody is rostered to open is not monitoring and must not be priced as it.",
  },
  {
    item: "Partner coverage",
    note: "On-site hands where the delivery team is not. Estimated against an unarranged supplier until a partner has actually signed — label the line accordingly.",
  },
];

const COMMERCIAL_FIELDS: readonly { label: string; instruction: string }[] = [
  {
    label: "What the subscription includes, and what it does not",
    instruction:
      "Named modules, seat count, and the connectors covered. Everything absent should be absent by name, because silence is read as included by whoever is paying.",
  },
  {
    label: "How a scope change is priced and approved",
    instruction:
      "The mechanism, the rate and who signs. Agreed while everybody is friendly, because it is used when they are not.",
  },
  {
    label: "What happens at renewal, and what may change",
    instruction:
      "Indexation, seat growth, usage growth. A renewal with no agreed mechanism becomes a negotiation with an incumbent, which neither side enjoys.",
  },
  {
    label: "What the customer owns if this ends",
    instruction:
      "Their data, in what format, within how long, and at what cost. The answer belongs in the contract rather than in an exit conversation, and a clean answer here makes the sale easier rather than harder.",
  },
  {
    label: "Who pays for a delay caused by whom",
    instruction:
      "Access not granted, data not cleaned, a shutdown window missed. Named in advance, these are administration; discovered afterwards, they are a dispute.",
  },
  {
    label: "Which lines are estimates against unarranged suppliers",
    instruction:
      "Partner coverage and any hardware not yet quoted. Labelled explicitly, so a firm-looking total does not conceal two soft numbers.",
  },
];
