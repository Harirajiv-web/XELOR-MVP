"use client";

import { useState } from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState, FieldError } from "@spine/states";
import { date, dateTime, humanise } from "@spine/format";
import { StatusBadge } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import { Can, useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  ageLabel,
  circuitLabel,
  circuitTone,
  deliveryApi,
  mayRehearseInterruption,
  type BackupRow,
  type ChainVerificationRow,
  type CircuitVerdict,
  type ConnectionRow,
  type DataEnvelope,
  type FactoryIntegrationView,
} from "../api";
import { Bound, Fact, Field, NeverClaim, NotStored, Panel, Recorded, Stat } from "../evidence";

/**
 * COMMISSIONING — the acceptance evidence pack.
 *
 * Commissioning is the moment a customer stops paying for a project and starts relying on a
 * system, and the document that marks it is usually the weakest one in the engagement: a
 * sign-off sheet asserting that everything works, produced by the people who built it, with
 * nothing attached that a third party could check.
 *
 * What makes an evidence pack different from a sign-off sheet is that every claim on it
 * points at a record somebody else could re-read. Seven sections, and this screen is explicit
 * about which of them the platform can actually evidence:
 *
 *   AS-INSTALLED       real — the gateways that exist, their deployment mode and software
 *                      version. Not what was quoted: what is there.
 *   SIGNAL VALIDATION  real — heartbeat freshness, and the API's own sentence about what
 *                      each heartbeat is evidence OF.
 *   INTERRUPTION TEST  real, and rehearsable — the circuit breaker can be opened and closed
 *                      against a fake-adapter connection, and the transitions are audited.
 *   RESTORE REHEARSAL  real — whether a backup has ever been proven to restore WITH the
 *                      audit chain intact, which is the only version of that test worth
 *                      anything.
 *   EVIDENCE INTEGRITY real — the audit chain's own verification history.
 *   TRAINING SIGN-OFF  not stored.
 *   WARRANTY & ESCALATION  not stored.
 *
 * ---------------------------------------------------------------------------
 * THE SENTENCE THIS SCREEN WILL NOT LET ANYBODY SKIP
 * ---------------------------------------------------------------------------
 * A gateway in `simulator` deployment mode has no physical controller behind it. The API
 * says so itself, in a `boundary` field and in a per-gateway `heartbeatSource` that reads
 * "stored simulator scenario activity; not a physical heartbeat". Both are rendered verbatim
 * and never paraphrased, because a paraphrase is where the qualification goes missing. A
 * commissioning pack that presented simulator evidence as plant evidence would be the single
 * most damaging document this module could produce — it is the one a customer would later
 * hold up.
 */
export default function CommissioningScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const factory = useQuery<FactoryIntegrationView>(deliveryApi.factoryViewPath);
  const view = factory.data;

  const gateways = view?.gateways ?? [];
  const installed = gateways.length;
  const simulated = gateways.filter((g) => g.deploymentMode === "simulator").length;
  const stale = gateways.filter((g) => g.heartbeatStale).length;
  const commands = view?.commands ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Commissioning & acceptance evidence"
        subtitle="What is actually installed, whether its signals are fresh, whether an interruption and a restore have been rehearsed, and which parts of the handover this system cannot evidence at all."
        meta={[
          { label: "Gateways installed", value: String(installed) },
          { label: "Simulator", value: simulated > 0 ? String(simulated) : "None" },
          { label: "Stale heartbeats", value: stale > 0 ? String(stale) : "None" },
        ]}
      />

      {view?.boundary ? (
        <div className="x-notice" data-tone="warning">
          <div>
            <p>
              <strong>The platform states its own boundary, and it is quoted here verbatim:</strong>
            </p>
            <p className="mt-1">“{view.boundary}”</p>
            <p className="mt-1">
              This sentence is rendered exactly as the API returns it. It is not paraphrased,
              because a paraphrase is where the qualification quietly goes missing.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Edge gateways"
          value={String(installed)}
          hint="As-installed records. What is physically or logically there, not what the proposal listed."
        />
        <Stat
          label="In simulator mode"
          value={String(simulated)}
          hint="No physical controller behind these. Their evidence proves the pipeline, never the plant."
        />
        <Stat
          label="Heartbeats stale"
          value={String(stale)}
          hint="A gateway that has stopped reporting inside its freshness window. Stale is computed against that window, not guessed."
        />
        <Stat
          label="Bound assets"
          value={view ? String(view.summary.assets) : "—"}
          hint={view ? view.summary.headline : "Needs integration.factory-connect.read."}
        />
      </div>

      {/* ---------------------------- 1. As installed -------------------------- */}

      <Panel
        title="1 · As-installed record"
        lede="Every gateway, its deployment mode, its software version and when it last reported."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={factory.loading}
            onClick={factory.reload}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${factory.loading ? "animate-spin" : ""}`} aria-hidden />
            Re-read
          </button>
        }
      >
        {factory.error ? (
          <ErrorState error={factory.error} onRetry={factory.reload} />
        ) : gateways.length === 0 ? (
          <Empty
            title="No gateway is recorded"
            body={
              factory.loading
                ? "Reading the installed gateways…"
                : "Nothing is installed against this tenant. A commissioning pack with no as-installed record is a sign-off sheet, and should not be presented as anything more."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[48rem]">
              <caption className="sr-only">
                Installed edge gateways with deployment mode, version and heartbeat
              </caption>
              <thead>
                <tr>
                  <th scope="col">Gateway</th>
                  <th scope="col">Where</th>
                  <th scope="col">Deployment</th>
                  <th scope="col">Software</th>
                  <th scope="col">Health</th>
                  <th scope="col">Last reported</th>
                </tr>
              </thead>
              <tbody>
                {gateways.map((gateway) => (
                  <tr key={gateway.code}>
                    <td>
                      <strong>{gateway.name}</strong>
                      <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                        {gateway.code}
                      </div>
                    </td>
                    <td className="text-[var(--text-secondary)]">
                      {gateway.siteCode ?? "Site not recorded"}
                      {gateway.zoneCode ? ` · ${gateway.zoneCode}` : ""}
                    </td>
                    <td>
                      <StatusBadge
                        tone={gateway.deploymentMode === "simulator" ? "draft" : "progress"}
                        label={humanise(gateway.deploymentMode)}
                      />
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Commands: {humanise(gateway.commandMode)}
                      </div>
                    </td>
                    <td className="font-[var(--font-mono)] text-[11px]">
                      {gateway.softwareVersion ?? "Not recorded"}
                    </td>
                    <td>
                      <StatusBadge status={gateway.healthStatus} />
                      {gateway.reportedHealthStatus !== gateway.healthStatus ? (
                        <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                          Self-reported: {humanise(gateway.reportedHealthStatus)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {gateway.lastHeartbeatAt ? dateTime(gateway.lastHeartbeatAt) : "Never"}
                      <div
                        className={
                          gateway.heartbeatStale
                            ? "mt-1 text-[11px] text-[var(--status-rejected-text)]"
                            : "mt-1 text-[11px] text-[var(--text-muted)]"
                        }
                      >
                        {ageLabel(gateway.lastHeartbeatAt)}
                        {gateway.heartbeatStale ? " · stale" : ""}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Recorded
          source={`read from /integration/factory/views/integration (integration.factory-connect.read)${
            view ? `, generated ${dateTime(view.generatedAt)}` : ""
          }`}
        />
      </Panel>

      {/* -------------------------- 2. Signal validation ----------------------- */}

      <Panel
        title="2 · Signal validation"
        lede="What each heartbeat is evidence of, in the platform's own words rather than ours."
      >
        {gateways.length === 0 ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            No gateway is reporting, so there is no signal to validate.
          </p>
        ) : (
          <ul className="space-y-2">
            {gateways.map((gateway) => (
              <li
                key={gateway.code}
                className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3"
              >
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                  {gateway.name}
                  <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                    {gateway.code}
                  </span>
                </p>
                <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
                  <strong>Heartbeat source: </strong>
                  {gateway.heartbeatSource}
                </p>
                <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--text-muted)]">
                  Capabilities declared:{" "}
                  {gateway.capabilities && gateway.capabilities.length > 0
                    ? gateway.capabilities.join(", ")
                    : "none recorded"}
                </p>
              </li>
            ))}
          </ul>
        )}

        <Bound>
          <p>
            <strong>
              A declared capability is what the gateway says it can do, not a validated
              signal.
            </strong>{" "}
            Signal validation for a commissioning pack means each tag was compared against the
            machine's own display, by a person, at a stated time. The platform can tell you
            the signal arrived and how old it is; only somebody standing at the machine can
            tell you it is the right number.
          </p>
        </Bound>

        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Tag-by-tag validation record"
            instruction="Each signal compared against the machine's own display or a calibrated instrument, with the reading, the time and the engineer's name. This is the part an auditor asks for and the part that is never written down."
          />
          <Field
            label="Signals deliberately not validated"
            instruction="Named, with the reason — no safe access, machine not in production, tag exists but nothing uses it. An unvalidated signal that nobody flagged becomes a number somebody trusts."
          />
        </div>
        <Recorded source="heartbeat source and staleness read from /integration/factory/views/integration; the tag-by-tag record is not stored by this system." />
      </Panel>

      {/* -------------------------- 3. Interruption test ----------------------- */}

      {can("integration.connector.read") ? (
        <InterruptionTest />
      ) : (
        <Panel title="3 · Interruption test" lede="Prove the system degrades the way it was designed to.">
          <p className="text-[13px] text-[var(--text-secondary)]">
            This section needs <code className="font-[var(--font-mono)]">integration.connector.read</code>.
          </p>
        </Panel>
      )}

      {/* ---------------------- 4. Command rehearsal record -------------------- */}

      <Panel
        title="4 · Machine command record"
        lede="Every command this platform has issued, and whether it was simulated."
      >
        {commands.length === 0 ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            No machine command has been issued. For a read-only commissioning that is the
            expected state, and it should be written into the pack as such rather than left
            blank.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[36rem]">
              <caption className="sr-only">Machine commands with capability, status and simulation flag</caption>
              <thead>
                <tr>
                  <th scope="col">Command</th>
                  <th scope="col">Capability</th>
                  <th scope="col">Status</th>
                  <th scope="col">Issued</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((command) => (
                  <tr key={command.commandKey}>
                    <td className="font-[var(--font-mono)] text-[11px]">{command.commandKey}</td>
                    <td>{command.capability}</td>
                    <td>
                      <StatusBadge status={command.status} />
                      {command.simulated ? (
                        <StatusBadge className="ml-1.5" tone="draft" label="Simulated" />
                      ) : null}
                    </td>
                    <td>{dateTime(command.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Bound>
          <p>
            A command marked <strong>simulated</strong> did not reach a controller. It is
            evidence that the approval path, the expiry and the audit record all work — which
            is genuinely worth having in a pack — and it is not evidence that a machine
            responded.
          </p>
        </Bound>
        <Recorded source="read from /integration/factory/views/integration (integration.factory-connect.read)" />
      </Panel>

      {/* -------------------------- 5. Restore rehearsal ----------------------- */}

      <Can
        permission="admin.settings.write"
        fallback={
          <Panel title="5 · Restore rehearsal" lede="Whether a backup has ever been proven to come back.">
            <p className="text-[13px] text-[var(--text-secondary)]">
              This section needs <code className="font-[var(--font-mono)]">admin.settings.write</code>.
              Without it the pack has to assert the restore test from somebody's word, which is
              the assertion most likely to be wrong.
            </p>
          </Panel>
        }
      >
        <RestoreRehearsal />
      </Can>

      {/* ------------------------- 6. Evidence integrity ----------------------- */}

      <Can permission="admin.audit.read">
        <EvidenceIntegrity />
      </Can>

      {/* --------------------- 7. Training, warranty, escalation --------------- */}

      <Panel
        title="7 · Training sign-off, warranty boundaries and escalation"
        lede="The three parts of a handover that decide what happens after everyone goes home."
      >
        <NotStored
          what="Training records, warranty terms and escalation contacts"
          where="the signed handover certificate and the support schedule of the contract"
        >
          <p>
            None of these exists as a table in this platform, and this module does not create
            one. They are set out below as the structure a handover document needs, because the
            common failure is not a bad warranty clause — it is no clause, discovered during
            the first incident.
          </p>
        </NotStored>

        <div className="grid gap-3 md:grid-cols-2">
          {HANDOVER_FIELDS.map((item) => (
            <Field key={item.label} label={item.label} instruction={item.instruction}>
              {item.note ? <strong className="text-[var(--text-secondary)]">{item.note}</strong> : null}
            </Field>
          ))}
        </div>

        <Disclosure title="Why warranty boundaries belong in the commissioning pack rather than the contract alone">
          <p>
            The contract says what is covered. The commissioning pack is where the boundary is
            made concrete against what was actually installed: this gateway is under warranty,
            that PLC belongs to the machine builder, this network segment is the customer's,
            that cable was supplied by a third party. The same clause reads very differently
            once each item has a name against it.
          </p>
          <p className="mt-2">
            It is also the last moment when everyone involved is in the same room. A boundary
            agreed at commissioning is agreed by the people who know what happened; a boundary
            agreed during the first outage is agreed by whoever is available and angry.
          </p>
        </Disclosure>
      </Panel>

      <NeverClaim
        claim="the system is commissioned and certified"
        because="This pack evidences what is installed, what reported, what was rehearsed and what the audit chain says. Certification is a statement by an accredited body against a published scheme, and nothing here is that. Where a gateway is in simulator mode the pack evidences the pipeline and not the plant, and the two must never be presented as one."
      />
    </div>
  );
}

/* ========================================================================== */
/* The interruption test. Real, rehearsable, and refused on live connections.  */
/* ========================================================================== */

function InterruptionTest(): React.JSX.Element {
  const connections = useQuery<DataEnvelope<ConnectionRow>>(deliveryApi.connectionsPath);
  const rows = connections.data?.data ?? [];
  const [selected, setSelected] = useState("");
  const [verdict, setVerdict] = useState<CircuitVerdict | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const connection = rows.find((row) => row.name === selected) ?? rows[0];
  const permission = connection
    ? mayRehearseInterruption(connection)
    : { allowed: false, reason: "No connection is configured, so there is nothing to interrupt." };

  async function record(outcome: "failure" | "success"): Promise<void> {
    if (!connection) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.post<CircuitVerdict>(
        deliveryApi.connectionOutcomePath(connection.name, outcome),
      );
      setVerdict(result);
      connections.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The outcome could not be recorded. Nothing changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="3 · Interruption test"
      lede="Prove the system degrades the way it was designed to — by actually interrupting it, on a connection where that is safe."
    >
      <Bound>
        <p>
          <strong>
            This test moves a real circuit breaker, so it is offered only on a fake-adapter
            connection.
          </strong>{" "}
          A fake adapter runs the whole pipeline — mapping, breaker, retry, dead-letter,
          audit — with nothing leaving the building, which makes it a rehearsal. Recording a
          failure against a live connection would be an outage somebody has to explain, so the
          controls below refuse rather than warn.
        </p>
      </Bound>

      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          {connections.loading
            ? "Reading the connections…"
            : "No connection is configured, so no interruption can be rehearsed."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
              Connection to rehearse against
              <select
                aria-label="Connection to rehearse an interruption against"
                className="h-10 max-w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-primary)]"
                value={connection?.name ?? ""}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setVerdict(null);
                  setError("");
                }}
              >
                {rows.map((row) => (
                  <option key={row.name} value={row.name}>
                    {row.name} · {row.adapterMode}
                  </option>
                ))}
              </select>
            </label>
            <Can
              permission="integration.flow.manage"
              fallback={
                <p className="text-[11px] text-[var(--text-muted)]">
                  Rehearsing needs <code className="font-[var(--font-mono)]">integration.flow.manage</code>.
                </p>
              }
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!permission.allowed || busy}
                title={permission.reason}
                onClick={() => void record("failure")}
              >
                <PlugZap className="h-3.5 w-3.5" aria-hidden />
                Record a failed call
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!permission.allowed || busy}
                title={permission.reason}
                onClick={() => void record("success")}
              >
                Record a successful call
              </button>
            </Can>
          </div>

          <p
            className="text-[12px] leading-[1.6] text-[var(--text-secondary)]"
            role={permission.allowed ? undefined : "alert"}
          >
            {permission.reason}
          </p>

          {error ? <FieldError message={error} /> : null}

          {connection ? (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Adapter mode">{humanise(connection.adapterMode)}</Fact>
              <Fact label="Current traffic state">
                <StatusBadge
                  tone={circuitTone(connection.circuitState)}
                  label={circuitLabel(connection.circuitState)}
                />
              </Fact>
              <Fact label="Consecutive failures">{connection.consecutiveFailures}</Fact>
              <Fact label="Health">
                <StatusBadge status={connection.healthStatus} />
              </Fact>
            </dl>
          ) : null}

          {verdict ? (
            <div className="x-notice" role="status">
              <div>
                <p>
                  <strong>{circuitLabel(verdict.state)}</strong>
                  {verdict.changed ? " — the breaker moved on that call." : " — no transition."}
                </p>
                <p className="mt-1">{verdict.message}</p>
                <p className="mt-1">
                  {verdict.consecutiveFailures} consecutive failure
                  {verdict.consecutiveFailures === 1 ? "" : "s"} ·{" "}
                  {verdict.consecutiveSuccesses} consecutive success
                  {verdict.consecutiveSuccesses === 1 ? "" : "es"}
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Disclosure title="What an interruption test is actually evidence of">
        <p>
          It shows that repeated failures open the breaker, that an open breaker fails fast
          instead of spending thirty seconds per document rediscovering the same outage, that
          the transition is written to the audit trail, and that recorded successes close it
          again. That is a real property of this system and it is worth demonstrating to a
          customer with the screen in front of them.
        </p>
        <p className="mt-2">
          It is not evidence that the customer's own system fails over, that their network
          recovers, or that anybody is watching when it happens. Those are three separate
          tests with three separate owners, and a commissioning pack should name all three
          even where only this one was run.
        </p>
      </Disclosure>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Power and network interruption, witnessed"
          instruction="Who pulled what, at what time, what the plant saw, and how long recovery took. A rehearsal nobody witnessed is a claim."
        />
        <Field
          label="What was deliberately not interrupted, and why"
          instruction="Usually anything that would stop production. Write the reason — an untested failure mode that everybody knows about is manageable; one nobody recorded is not."
        />
      </div>

      <Recorded source="connection state read from /integration/connections; outcomes post to /integration/connections/:name/outcome/:outcome (integration.flow.manage). A breaker opening is written to the audit trail as integration.circuit.opened." />
    </Panel>
  );
}

/* ========================================================================== */

function RestoreRehearsal(): React.JSX.Element {
  const backups = useQuery<DataEnvelope<BackupRow>>(deliveryApi.backupsPath);
  const rows = backups.data?.data ?? [];
  const unproven = rows.filter((row) => row.restorePreservedChain !== true);
  const offshore = rows.filter((row) => !row.residency.startsWith("India"));

  return (
    <Panel
      title="5 · Restore rehearsal"
      lede="Whether a backup has ever been proven to come back — with the audit chain intact, which is the only version of the test that counts."
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          {backups.loading
            ? "Reading the backup jobs…"
            : "No backup job is configured. There is nothing to rehearse and nothing to hand over."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[44rem]">
            <caption className="sr-only">
              Backup jobs with residency, last run and restore-test assurance
            </caption>
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Schedule</th>
                <th scope="col">Residency</th>
                <th scope="col">Last run</th>
                <th scope="col">Restore assurance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>
                    <strong>{row.name}</strong>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {row.encryption} · {row.retentionPolicy}
                    </div>
                  </td>
                  <td className="font-[var(--font-mono)] text-[11px]">{row.schedule}</td>
                  <td>
                    {row.residency.startsWith("India") ? (
                      <StatusBadge tone="done" label="India" />
                    ) : (
                      <StatusBadge tone="rejected" label="Outside India" />
                    )}
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">{row.region}</div>
                  </td>
                  <td>
                    {row.lastRunAt ? date(row.lastRunAt) : "Never"}
                    {row.lastRunStatus ? (
                      <div className="mt-1">
                        <StatusBadge status={row.lastRunStatus} />
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {row.restorePreservedChain === true ? (
                      <StatusBadge tone="done" label="Proven" />
                    ) : (
                      <StatusBadge tone="overdue" label="Unproven" />
                    )}
                    <div className="mt-1 text-[11px] leading-[1.6] text-[var(--text-secondary)]">
                      {row.assurance}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unproven.length > 0 ? (
        <div className="x-notice" data-tone="error">
          <div>
            <p>
              <strong>
                {unproven.length} backup job{unproven.length === 1 ? "" : "s"} cannot be
                evidenced as restorable with the audit chain intact.
              </strong>{" "}
              An untested backup is a hope rather than a control, and a restore that breaks the
              hash chain destroys the very evidence the backup existed to protect. Neither
              belongs in a commissioning pack as a tick.
            </p>
          </div>
        </div>
      ) : null}

      {offshore.length > 0 ? (
        <div className="x-notice" data-tone="error">
          <div>
            <p>
              <strong>
                {offshore.length} backup target{offshore.length === 1 ? " is" : "s are"} outside
                India.
              </strong>{" "}
              Data residency is a contractual and statutory question, not a preference, and it
              has to be resolved before handover rather than raised in a later audit.
            </p>
          </div>
        </div>
      ) : null}

      <Recorded source="read from /admin/backups (admin.settings.write). The residency and assurance sentences are the API's own." />
    </Panel>
  );
}

/* ========================================================================== */

function EvidenceIntegrity(): React.JSX.Element {
  const verifications = useQuery<DataEnvelope<ChainVerificationRow>>(
    deliveryApi.auditVerificationsPath,
  );
  const rows = verifications.data?.data ?? [];
  const latest = rows[0];
  const broken = rows.filter((row) => !row.intact);

  return (
    <Panel
      title="6 · Evidence integrity"
      lede="Whether the audit trail underneath this whole pack has been verified, and when."
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          {verifications.loading
            ? "Reading the verification history…"
            : "The audit chain has never been verified in this tenant. A commissioning pack rests on the audit trail; verifying it once, at handover, is what makes every other claim in the pack checkable."}
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Last verified">
              {latest ? dateTime(latest.verifiedAt) : "—"}
            </Fact>
            <Fact label="Result">
              {latest ? (
                <StatusBadge
                  tone={latest.intact ? "done" : "rejected"}
                  label={latest.intact ? "Chain intact" : "Chain broken"}
                />
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Rows checked">{latest ? latest.rowsChecked : "—"}</Fact>
            <Fact label="Verifications on record">{rows.length}</Fact>
          </dl>

          {latest ? (
            <p className="text-[12px] leading-[1.6] text-[var(--text-secondary)]">
              {latest.message}
            </p>
          ) : null}

          {broken.length > 0 ? (
            <div className="x-notice" data-tone="error">
              <div>
                <p>
                  <strong>
                    {broken.length} verification{broken.length === 1 ? "" : "s"} found a break
                    in the chain.
                  </strong>{" "}
                  A break is evidence that entries were altered, replaced or removed. It has to
                  be investigated and explained in the pack, not footnoted.
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}
      <Recorded source="read from /admin/audit/verifications (admin.audit.read)" />
    </Panel>
  );
}

/* ========================================================================== */

interface HandoverField {
  label: string;
  instruction: string;
  note?: string;
}

const HANDOVER_FIELDS: readonly HandoverField[] = [
  {
    label: "Training delivered: who, what, and how it was checked",
    instruction:
      "Names, roles, the tasks covered and — the part that matters — how competence was verified. Attendance is not training; watching somebody complete the task unaided is.",
    note: "A signature sheet with no verification step is the most common finding at the first support call.",
  },
  {
    label: "Who can train the next person",
    instruction:
      "Name at least two people on the customer's side who can teach a new starter without calling us. Staff turnover, not software, is what ends most successful implementations.",
  },
  {
    label: "Warranty boundary, item by item against the as-installed list",
    instruction:
      "For each gateway, sensor, cable and network segment above: who supplied it, who warrants it, for how long, and what voids it. A boundary written against product categories rather than installed items is a boundary that gets argued.",
  },
  {
    label: "What is explicitly excluded from warranty",
    instruction:
      "Customer network, customer hardware, machine-builder PLCs, anything a third party installed, damage from plant conditions. Excluded items should be listed by name, because silence reads as inclusion.",
  },
  {
    label: "Escalation contacts, with hours and a second line",
    instruction:
      "Names and numbers on both sides, the hours each is actually reachable, and who is called when the first person does not answer. A single contact is a single point of failure with a phone.",
    note: "Hours must match what is actually staffed — see the support record for why a coverage table is not coverage.",
  },
  {
    label: "The first review date, in the diary before anyone leaves",
    instruction:
      "A date, with attendees. A review scheduled after handover is a review scheduled by nobody, and the first month is when the questions that matter arrive.",
  },
];
