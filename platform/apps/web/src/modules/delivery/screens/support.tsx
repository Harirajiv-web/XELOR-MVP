"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState } from "@spine/states";
import { dateTime, humanise, num } from "@spine/format";
import { StatusBadge } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import { Can } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  deliveryApi,
  type DataEnvelope,
  type IncidentRow,
  type PostureSummary,
  type SettingRow,
} from "../api";
import { Bound, Fact, Field, NeverClaim, NotStored, Panel, Recorded, Stat } from "../evidence";

/**
 * SUPPORT — the support record, and the hardest screen in this module to keep honest.
 *
 * ---------------------------------------------------------------------------
 * THE ONE SENTENCE THIS SCREEN EXISTS TO PROTECT
 * ---------------------------------------------------------------------------
 * A SERVICE DASHBOARD IS NOT A STAFFED SERVICE. Software can record a commitment — four
 * hours, business days, a named escalation, a monthly review — and can show that commitment
 * beautifully. It cannot wake anybody up. Every hour on a coverage table is a person who has
 * agreed to be available, has been paid for it, and has a colleague covering their leave;
 * where that is not true the table is a picture of a service rather than a service, and the
 * first Saturday is when the difference is discovered.
 *
 * This matters more here than anywhere else in the product because support is the offering a
 * buyer most readily believes on the strength of a screen. So the coverage, severity and
 * escalation panels below are rendered as EMPTY STRUCTURE with the notice attached, and the
 * things the platform can genuinely evidence are kept separate and labelled as records.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS GENUINELY LIVE HERE, AND WHY IT BELONGS ON A SUPPORT SCREEN
 * ---------------------------------------------------------------------------
 * Three statutory and operational obligations are real, live, and carry no MSME carve-out.
 * They are not marketing items; they are duties that attach the moment the system is in use,
 * and a support arrangement that has not accounted for them is incomplete:
 *
 *   CERT-IN 6-HOUR REPORTING — a reportable incident must be reported to CERT-In within six
 *   hours of being noticed. Six hours is shorter than most support rotas, which is precisely
 *   the point: the clock runs on detection, not on the start of the next working day. The
 *   incident list below carries that clock, computed on the server, per incident.
 *
 *   180-DAY LOG RETENTION IN INDIA — security logs retained for at least 180 days, resident
 *   in India. The floor is a statutory minimum recorded against the setting itself, with the
 *   direction that sets it named.
 *
 *   NTP SYNCHRONISATION to an NIC/NPL-traceable source — an audit trail whose timestamps came
 *   from an unsynchronised clock is a trail whose ordering cannot be relied on, which
 *   undermines every other record on which a support claim would rest.
 *
 * All three read out of real rows. None of them is a feature of this module; the platform
 * already keeps them, and the support record's job is to make sure the arrangement being sold
 * has somebody accountable for each.
 */
export default function SupportScreen(_props: ScreenProps): React.JSX.Element {
  const incidents = useQuery<DataEnvelope<IncidentRow>>(deliveryApi.incidentsPath);
  // Memoised so the empty-array fallback keeps one identity across renders; it is a
  // dependency of the clock below.
  const rows = useMemo(() => incidents.data?.data ?? [], [incidents.data]);

  const clock = useMemo(() => {
    const reportable = rows.filter((row) => row.certInReportable);
    const breached = reportable.filter((row) => row.breached);
    const running = reportable.filter(
      (row) => row.status === "urgent" || row.status === "on_track",
    );
    const open = rows.filter((row) => row.recordStatus !== "closed");
    return { reportable, breached, running, open };
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Support record"
        subtitle="The coverage, severity and escalation arrangement as a structure to be agreed and staffed — alongside the statutory clocks the platform genuinely runs, which no support arrangement may ignore."
        meta={[
          { label: "Incidents on record", value: String(rows.length) },
          {
            label: "CERT-In clocks running",
            value: clock.running.length > 0 ? String(clock.running.length) : "None",
          },
          {
            label: "Deadlines breached",
            value: clock.breached.length > 0 ? String(clock.breached.length) : "None",
          },
        ]}
      />

      <NeverClaim
        claim="we provide 24×7 support with a four-hour response"
        because="This software records a commitment; it does not staff one. An hour on a coverage table is only real if a named person has agreed to be available then, is paid for it, and has somebody covering their leave. Never state a response time, a coverage window or an availability target that named people with named hours cannot actually deliver — the screen will look identical either way, and the first Saturday is when the difference is found out."
      />

      {/* --------------------------- 1. Coverage ------------------------------- */}

      <Panel
        title="1 · Coverage calendar"
        lede="The hours somebody is actually available, the person who is available in them, and who covers their absence."
      >
        <NotStored
          what="The coverage calendar"
          where="the support schedule of the signed contract, and the rota the on-call people have actually agreed to"
        >
          <p>
            There is no coverage table in this platform and this module does not create one.
            Filling the blanks below produces the text of a schedule; it does not produce a
            rota, and it does not make anybody available.
          </p>
        </NotStored>

        <div className="grid gap-3 md:grid-cols-2">
          {COVERAGE_FIELDS.map((item) => (
            <Field key={item.label} label={item.label} instruction={item.instruction} />
          ))}
        </div>

        <Disclosure title="The three questions that turn a coverage table into a coverage commitment">
          <p>
            <strong>Who, specifically?</strong> A window covered by "the support team" is
            covered by whoever happens to be reachable. Name the person and the person behind
            them. Two names per window is the minimum that survives one illness.
          </p>
          <p className="mt-2">
            <strong>Paid how?</strong> Out-of-hours availability that is not compensated is
            availability that erodes — first quietly, then all at once when the person leaves.
            If the commercial model has no line for on-call, the coverage window is aspirational
            and should be sold as business hours.
          </p>
          <p className="mt-2">
            <strong>Reached how?</strong> A number that rings a desk phone in an empty office
            at 2 a.m. is a coverage gap wearing a contact detail. Write down the channel, and
            test it before go-live rather than during the first incident.
          </p>
        </Disclosure>
      </Panel>

      {/* --------------------------- 2. Severity ------------------------------- */}

      <Panel
        title="2 · Severity, defined by consequence rather than by feeling"
        lede="What each level means in terms of the plant, so the customer and the delivery team classify the same event the same way."
      >
        <NotStored
          what="The severity definitions and their response targets"
          where="the support schedule, as a table both parties signed"
        >
          <p>
            The definitions below are a starting structure. What makes them work is that each
            level is defined by a CONSEQUENCE the customer can observe — production stopped,
            dispatch blocked, a statutory deadline at risk — rather than by how urgent it feels
            to whoever is reporting it.
          </p>
        </NotStored>

        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[44rem]">
            <caption className="sr-only">
              Severity levels with the observable consequence that defines each
            </caption>
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Defined by this consequence</th>
                <th scope="col">What has to be agreed</th>
              </tr>
            </thead>
            <tbody>
              {SEVERITY_LEVELS.map((level) => (
                <tr key={level.level}>
                  <td>
                    <strong>{level.level}</strong>
                  </td>
                  <td>{level.consequence}</td>
                  <td className="text-[var(--text-secondary)]">{level.agree}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Bound>
          <p>
            <strong>A response target is not a resolution target, and the two get conflated
            in every dispute.</strong>{" "}
            Response is when a named person acknowledges and starts. Resolution depends on what
            broke, and some causes — a customer's own network, a third-party portal, a machine
            builder's controller — are not ours to resolve at any speed. Write both, and write
            which causes stop the clock.
          </p>
        </Bound>
      </Panel>

      {/* ------------------- 3. Live statutory obligations --------------------- */}

      <Panel
        title="3 · CERT-In reporting clock"
        lede="Six hours from noticing, per reportable incident. Computed on the server against the recorded detection time."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={incidents.loading}
            onClick={incidents.reload}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${incidents.loading ? "animate-spin" : ""}`} aria-hidden />
            Re-read
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Incidents on record"
            value={String(rows.length)}
            hint={`${clock.open.length} not closed. Every one carries the detection time it was recorded with.`}
          />
          <Stat
            label="Reportable to CERT-In"
            value={String(clock.reportable.length)}
            hint="Classified reportable. The classification can change, so the clock is recorded for every incident either way."
          />
          <Stat
            label="Clocks still running"
            value={String(clock.running.length)}
            hint="Six hours from detection. Shorter than most support rotas — which is exactly why it belongs in the coverage conversation."
          />
          <Stat
            label="Deadlines breached"
            value={String(clock.breached.length)}
            hint="Reported late, or not yet reported past the deadline. The lateness is part of the record and cannot be edited out."
          />
        </div>

        <Bound>
          <p>
            <strong>
              CERT-In's six-hour reporting duty, India's 180-day security-log retention and the
              NTP synchronisation requirement are live, and there is no MSME carve-out.
            </strong>{" "}
            They attach to the customer whether or not a support contract mentions them. A
            support arrangement that does not say who notices, who classifies and who files is
            an arrangement that will discover the gap on the day it matters.
          </p>
        </Bound>

        {incidents.error ? (
          <ErrorState error={incidents.error} onRetry={incidents.reload} />
        ) : rows.length === 0 ? (
          <Empty
            title="No incident is on record"
            body="Nothing has been recorded against this tenant. That is the expected state for a new installation — but the six-hour clock starts on detection whenever the first one happens, so the coverage window and the person who classifies must be agreed before then, not after."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[48rem]">
              <caption className="sr-only">
                Security incidents with severity, CERT-In deadline and reporting status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Incident</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Detected</th>
                  <th scope="col">CERT-In due</th>
                  <th scope="col">Clock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.incidentNo}>
                    <td>
                      <strong>{row.title}</strong>
                      <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                        {row.incidentNo} · {humanise(row.category)}
                      </div>
                      {row.piiAffected ? (
                        <StatusBadge className="mt-1" tone="overdue" label="PII affected" />
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={row.severity} />
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {humanise(row.recordStatus)}
                      </div>
                    </td>
                    <td>{dateTime(row.detectedAt)}</td>
                    <td>
                      {dateTime(row.certInDueAt)}
                      {row.dpdpBoardDueAt ? (
                        <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                          DPDP board: {dateTime(row.dpdpBoardDueAt)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          row.breached
                            ? "overdue"
                            : row.status === "reported"
                              ? "done"
                              : row.status === "urgent"
                                ? "rejected"
                                : row.status === "not_reportable"
                                  ? "draft"
                                  : "pending"
                        }
                        label={humanise(row.status)}
                      />
                      <div className="mt-1 text-[11px] leading-[1.6] text-[var(--text-secondary)]">
                        {row.message}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Recorded source="read from /admin/incidents (admin.incident.write). The six-hour clock is computed on the server from the recorded detection time — it is a date comparison, not an assessment." />
      </Panel>

      <Can
        permission="admin.settings.write"
        fallback={
          <Panel title="4 · Retention and time synchronisation" lede="The two standing obligations behind every other record.">
            <p className="text-[13px] text-[var(--text-secondary)]">
              These read from the system settings and need{" "}
              <code className="font-[var(--font-mono)]">admin.settings.write</code>. They remain
              in force whether or not anybody on this engagement can see them.
            </p>
          </Panel>
        }
      >
        <StatutoryFloors />
      </Can>

      <Can permission="admin.access.read">
        <ControlPlane />
      </Can>

      {/* --------------------------- 5. Escalation ----------------------------- */}

      <Panel
        title="5 · Named escalation"
        lede="Who is called, in what order, and what each of them can actually authorise."
      >
        <NotStored
          what="The escalation contacts"
          where="the support schedule, and whatever on-call directory the people involved actually check"
        >
          <p>
            An escalation path is only as good as the last time somebody tested it. Record when
            it was last walked end to end — a path nobody has dialled is a list of names.
          </p>
        </NotStored>
        <div className="grid gap-3 md:grid-cols-2">
          {ESCALATION_FIELDS.map((item) => (
            <Field key={item.label} label={item.label} instruction={item.instruction} />
          ))}
        </div>
      </Panel>

      {/* ------------------------- 6. Monthly review --------------------------- */}

      <Panel
        title="6 · Monthly outcome review"
        lede="What the review covers, and which figures on it come from records rather than recollection."
      >
        <NotStored
          what="The review itself — its minutes, actions and agreed improvements"
          where="the service review pack, circulated and accepted by both sponsors"
        >
          <p>
            The figures in the left column below <strong>are</strong> records and can be quoted
            with their source. The right column is what somebody has to write down afterwards,
            and it has no home in this system.
          </p>
        </NotStored>

        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[44rem]">
            <caption className="sr-only">
              Monthly review agenda with the evidence available for each item
            </caption>
            <thead>
              <tr>
                <th scope="col">On the agenda</th>
                <th scope="col">Evidence available</th>
                <th scope="col">Comes from</th>
              </tr>
            </thead>
            <tbody>
              {REVIEW_AGENDA.map((item) => (
                <tr key={item.item}>
                  <td>
                    <strong>{item.item}</strong>
                  </td>
                  <td>
                    <StatusBadge
                      tone={item.recorded ? "done" : "draft"}
                      label={item.recorded ? "From records" : "Not stored"}
                    />
                    <div className="mt-1 text-[11px] leading-[1.6] text-[var(--text-muted)]">
                      {item.note}
                    </div>
                  </td>
                  <td className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
                    {item.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Disclosure title="Why a review that only reports green is the one to worry about">
          <p>
            A monthly review whose figures always look fine is usually measuring things that
            cannot go wrong rather than things the customer cares about. The useful review has
            at least one number that moves, one item carried forward from last month with a
            reason, and one thing the delivery team got wrong and fixed.
          </p>
          <p className="mt-2">
            The figures on this platform that genuinely move are the recovery backlog, the
            migration reconciliation gap, the incident clock and the restore assurance. Those
            are the ones worth putting in front of a sponsor, because each has an owner and an
            action.
          </p>
        </Disclosure>
      </Panel>

      <NeverClaim
        claim="we have a partner network covering installation and on-site support"
        because="Candidate companies identified in research are options, not endorsements and not confirmed partnerships. None has been contacted, none has quoted, none has agreed a rate or a response time. Until a partner has signed something, the honest sentence is that on-site coverage in that region is not yet arranged — and if the commercial model prices partner coverage, that line is an estimate against an unarranged supplier."
      />

      <NeverClaim
        claim="the OT environment is secured and certified to IEC 62443"
        because="Alignment with the principles of a standard is not certification of a factory. Certification is granted by an accredited body against a defined scope and audit, and nothing in this product constitutes one. Nor does any control here guarantee a plant will not be attacked — segmentation, least privilege and an audit trail reduce and evidence risk; they do not remove it, and saying otherwise transfers a liability nobody intended to accept."
      />
    </div>
  );
}

/* ========================================================================== */

function StatutoryFloors(): React.JSX.Element {
  const settings = useQuery<DataEnvelope<SettingRow>>(deliveryApi.settingsPath);
  const rows = settings.data?.data ?? [];

  /**
   * Only the settings a STATUTE pins, plus the time source.
   *
   * A support screen listing every system setting would bury the three that carry a legal
   * duty among thirty that carry a preference. `statutoryFloor` is non-null precisely when
   * somebody outside this company set the minimum, and `floorSource` names them.
   */
  const floors = rows.filter((row) => row.statutoryFloor !== null);
  const time = rows.filter((row) => row.key.startsWith("ntp."));
  const shown = [...floors, ...time];

  return (
    <Panel
      title="4 · Retention floors and time synchronisation"
      lede="Minimums set by a direction rather than by us, and the clock every audit timestamp depends on."
    >
      {shown.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          {settings.loading
            ? "Reading the system settings…"
            : "No setting in this tenant carries a statutory floor or names a time source. That is itself worth raising: the obligations do not disappear because nothing was configured."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[44rem]">
            <caption className="sr-only">
              System settings carrying a statutory floor, with the direction that sets each
            </caption>
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">Configured</th>
                <th scope="col">Statutory minimum</th>
                <th scope="col">Set by</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const configured = Number(row.value);
                const below =
                  row.statutoryFloor !== null &&
                  Number.isFinite(configured) &&
                  configured < row.statutoryFloor;
                return (
                  <tr key={row.key}>
                    <td>
                      <strong className="font-[var(--font-mono)] text-[11.5px]">{row.key}</strong>
                      {row.description ? (
                        <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {below ? (
                        <strong className="text-[var(--status-rejected-text)]">{row.value}</strong>
                      ) : (
                        row.value
                      )}
                    </td>
                    <td>
                      {row.statutoryFloor === null ? (
                        <span className="text-[var(--text-muted)]">Not a numeric floor</span>
                      ) : (
                        <>
                          {num(row.statutoryFloor)}
                          {below ? (
                            <StatusBadge className="ml-1.5" tone="rejected" label="Below floor" />
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="text-[var(--text-secondary)]">
                      {row.floorSource ?? "Not attributed"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Bound>
        <p>
          <strong>These floors are not ours to lower.</strong> A retention period shorter than
          the direction requires is a breach whatever the contract says, and an audit trail
          whose timestamps came from an unsynchronised clock is a trail whose ordering cannot
          be relied on — which quietly undermines every other record a support claim would rest
          on. The dated synchronisation log itself lives in the auditor pack rather than here.
        </p>
      </Bound>
      <Recorded source="read from /admin/settings (admin.settings.write). The floor and its source are stored against each setting, so the minimum and the direction that set it cannot drift apart." />
    </Panel>
  );
}

/* ========================================================================== */

function ControlPlane(): React.JSX.Element {
  const posture = useQuery<PostureSummary>(deliveryApi.posturePath);
  const data = posture.data;

  return (
    <Panel
      title="Control-plane posture at the time of this reading"
      lede="The security facts a support arrangement inherits on day one."
    >
      {posture.error ? (
        <ErrorState error={posture.error} onRetry={posture.reload} />
      ) : !data ? (
        <p className="text-[13px] text-[var(--text-secondary)]" role="status">
          Reading the control-plane posture…
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Active users">{num(data.activeUsers)}</Fact>
            <Fact label="Without MFA">
              {data.usersWithoutMfa > 0 ? (
                <strong className="text-[var(--status-rejected-text)]">
                  {num(data.usersWithoutMfa)}
                </strong>
              ) : (
                "None"
              )}
            </Fact>
            <Fact label="Live sessions">{num(data.liveSessions)}</Fact>
            <Fact label="Recent failed sign-ins">{num(data.recentFailedLogins)}</Fact>
          </dl>
          <p className="text-[12px] leading-[1.6] text-[var(--text-secondary)]">{data.headline}</p>
          {data.issues.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-[12px] leading-[1.6] text-[var(--text-secondary)]">
              {data.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-[11px] leading-[1.6] text-[var(--text-muted)]">
            Read {dateTime(data.asOf)}. This is a snapshot taken when the screen loaded, not a
            monitor — nothing here watches between visits or notifies anybody.
          </p>
        </>
      )}
      <Recorded source="read from /admin/posture (admin.access.read)" />
    </Panel>
  );
}

/* ========================================================================== */

const COVERAGE_FIELDS: readonly { label: string; instruction: string }[] = [
  {
    label: "Hours covered, per day of the week",
    instruction:
      "Local time, with the time zone written down. Include the days nobody is available — a blank cell reads as covered to whoever is looking at it during an outage.",
  },
  {
    label: "The named person in each window, and their backup",
    instruction:
      "Two names per window. One name is a rota that ends at the first illness, and the customer finds out during it.",
  },
  {
    label: "How they are reached, and when that was last tested",
    instruction:
      "Channel, number, and the date somebody actually dialled it out of hours. A contact detail nobody has tested is not a contact.",
  },
  {
    label: "What happens outside covered hours",
    instruction:
      "Stated plainly: queued until the next covered hour. Silence here is read as coverage, and it is the gap that produces the angriest call of the engagement.",
  },
  {
    label: "Public holidays and planned shutdowns",
    instruction:
      "Both sides' calendars. The plant's shutdown week and the support team's holidays rarely coincide, and each affects the other.",
  },
  {
    label: "What is excluded from support entirely",
    instruction:
      "Customer hardware, customer network, third-party portals, machine-builder controllers, anything installed by somebody else. Listed by name — silence reads as inclusion.",
  },
];

const ESCALATION_FIELDS: readonly { label: string; instruction: string }[] = [
  {
    label: "First line: who is called, and what they can decide alone",
    instruction:
      "The decisions they can take without waking anybody: restart, replay a failed message, open the incident. A first line that must escalate everything is a switchboard.",
  },
  {
    label: "Second line: who is called when the first cannot be reached",
    instruction:
      "With the wait before escalating. An escalation with no time limit is an escalation that happens when somebody loses patience, which is never the same moment twice.",
  },
  {
    label: "Who classifies an incident as CERT-In reportable",
    instruction:
      "By name, with a deputy, reachable within the six-hour window. This decision cannot wait for the next working day, and it is the one most often unassigned.",
  },
  {
    label: "Who may authorise a statutory replay or a data correction",
    instruction:
      "A duplicate statutory filing is visible to a regulator and cannot be quietly withdrawn. This authority belongs to a named person on the customer's side, not to whoever is on the console.",
  },
  {
    label: "The customer's own escalation path back to us",
    instruction:
      "Escalation runs both ways. A customer who does not know who to complain to complains to the sponsor, and the first the delivery team hears is a renewal conversation.",
  },
  {
    label: "When the path was last walked end to end",
    instruction:
      "A date. Untested escalation paths fail at the second step, reliably, and always at 2 a.m.",
  },
];

interface SeverityLevel {
  level: string;
  consequence: string;
  agree: string;
}

const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  {
    level: "S1 — production stopped",
    consequence:
      "The plant cannot make or dispatch. Nobody can work around it, and every hour is measurable in output.",
    agree:
      "Response target, who may declare it, and whether declaring it wakes people. If out-of-hours S1 is not staffed, say so here rather than implying otherwise.",
  },
  {
    level: "S2 — a statutory deadline at risk",
    consequence:
      "An e-invoice window, an e-way bill, a CERT-In report. The deadline is external and it does not move for a support rota.",
    agree:
      "Who watches the deadline, what the fallback filing route is, and who has authority to file late with a reason recorded.",
  },
  {
    level: "S3 — a workaround exists but costs time",
    consequence:
      "Work continues by hand, in a spreadsheet, or by re-keying. Measurable in hours rather than output.",
    agree:
      "Response within covered hours, and a review point — an S3 that persists for a month is an S2 nobody re-classified.",
  },
  {
    level: "S4 — cosmetic, or a question",
    consequence:
      "Nothing is blocked. A label is wrong, a report is awkward, somebody wants to know how to do something.",
    agree:
      "A queue and an honest cadence. Promising fast turnaround here is how S4 volume quietly consumes the capacity that S1 depends on.",
  },
];

interface ReviewItem {
  item: string;
  recorded: boolean;
  note: string;
  source: string;
}

/**
 * The review agenda, split by what can actually be evidenced.
 *
 * Six of these read out of real records and four do not. Saying which is which is the whole
 * value of the table: a service manager who believes ticket volumes are in the platform will
 * arrive at the review without them.
 */
const REVIEW_AGENDA: readonly ReviewItem[] = [
  {
    item: "Recovery backlog and what caused it",
    recorded: true,
    note: "Dead-lettered records by flow and category, with the replay verdict for each.",
    source: "/integration/dlq",
  },
  {
    item: "Connection health and interruptions",
    recorded: true,
    note: "Circuit state and consecutive failures per connection; breaker transitions are in the audit trail.",
    source: "/integration/connections",
  },
  {
    item: "Migration acceptance gap",
    recorded: true,
    note: "Presented minus landed minus refused, per load. Zero is the only acceptable figure for an accepted data set.",
    source: "/dataimport/batches",
  },
  {
    item: "Incidents and statutory clocks",
    recorded: true,
    note: "Detection time, six-hour deadline, whether it was reported inside it.",
    source: "/admin/incidents",
  },
  {
    item: "Backup and restore assurance",
    recorded: true,
    note: "Whether a restore has ever been proven with the audit chain intact, and where the data sits.",
    source: "/admin/backups",
  },
  {
    item: "Access posture",
    recorded: true,
    note: "MFA enrolment, live sessions, recent failed sign-ins.",
    source: "/admin/posture",
  },
  {
    item: "Ticket volume, response and resolution times",
    recorded: false,
    note: "There is no ticket table in this platform. These come from whatever service desk the engagement actually runs on.",
    source: "external service desk",
  },
  {
    item: "Service-level attainment against the agreed targets",
    recorded: false,
    note: "Requires both the targets and the ticket timestamps, and the platform holds neither.",
    source: "support schedule + service desk",
  },
  {
    item: "The improvement register, and what moved on it",
    recorded: false,
    note: "Carried items with a date and an owner. An improvement register with no dates is a wish list.",
    source: "review pack",
  },
  {
    item: "Renewal risks and what would change them",
    recorded: false,
    note: "A judgement, made by people, written down before it becomes a surprise.",
    source: "review pack",
  },
];
