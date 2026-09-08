"use client";

import { useMemo } from "react";
import { Ban, CircleCheck } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { Envelope, KillSwitchState, RegistryFeature } from "../api";
import { aiopsApi, ROLLOUT_TONE } from "../api";

/**
 * FEATURE REGISTRY — the chokepoint, listed.
 *
 * Everything else in AI governance is advisory without this table. The router keys on a
 * feature key and refuses one it does not recognise, so the blast radius of "AI" in this
 * product is exactly the rows below: no prompt, no provider key and no clever integration
 * can add a ninth feature without a code change and an ADR.
 *
 * Each row carries the two facts that matter operationally rather than architecturally:
 * how far the feature has rolled out, and what a user gets when it is switched off. The
 * second is the reason the kill switch is safe to pull — every feature already has an
 * answer to "and then what?".
 */
export default function RegistryScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<Envelope<RegistryFeature>>(aiopsApi.registryPath);
  // One read for every feature's switch state. This screen used to ask per row; the API now
  // answers for the whole closed list at once, which is the shape it should always have had.
  const switches = useQuery<Envelope<KillSwitchState>>(aiopsApi.killSwitchesPath);
  const rows = data?.data ?? [];

  const switchByFeature = useMemo(
    () => new Map((switches.data?.data ?? []).map((s) => [s.featureKey, s])),
    [switches.data],
  );

  const columns: ReadonlyArray<Column<RegistryFeature>> = [
    {
      key: "feature",
      header: "Feature",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.displayName}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            <code className="font-[var(--font-mono)]">{r.key}</code> · {r.ref} · owned by {humanise(r.ownerModule)}
          </div>
          {/* The sentence a Head of Ops reads before agreeing to any of this. */}
          <div className="mt-0.5 text-[12px] leading-[18px] text-[var(--text-muted)]">{r.ifSwitchedOff}</div>
        </div>
      ),
    },
    {
      key: "risk",
      header: "Risk tier",
      width: "w-32",
      render: (r) =>
        r.riskTier === null ? (
          <span className="text-[var(--text-muted)]">—</span>
        ) : (
          <div>
            <div className="text-[var(--text-primary)]">Tier {r.riskTier}</div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {r.riskTier === 1 ? "Advisory" : r.riskTier === 2 ? "May draft, never commit" : "Advisory forever"}
            </div>
          </div>
        ),
    },
    {
      key: "rollout",
      header: "Rollout",
      width: "w-40",
      render: (r) => (
        <div>
          <StatusBadge tone={ROLLOUT_TONE[r.rolloutStage] ?? "unknown"} label={humanise(r.rolloutStage)} />
          {r.rolloutReason ? (
            <div className="mt-1 text-[12px] text-[var(--text-secondary)]">{r.rolloutReason}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "eval",
      header: "Last eval gate",
      width: "w-40",
      render: (r) =>
        r.lastEvalVerdict === null ? (
          // Never evaluated is not the same as passed, and it must not look like it.
          <span className="text-[var(--text-muted)]">Never evaluated</span>
        ) : (
          <div>
            <StatusBadge
              tone={r.lastEvalVerdict === "pass" ? "done" : "rejected"}
              label={r.lastEvalVerdict === "pass" ? "Passed" : "Failed"}
            />
            <div className="mt-1 text-[12px] text-[var(--text-secondary)]">{date(r.lastEvalAt)}</div>
          </div>
        ),
    },
    {
      key: "kill",
      header: "Kill switch",
      width: "w-52",
      render: (r) => (
        <KillSwitchCell
          state={switchByFeature.get(r.key) ?? null}
          loading={switches.loading}
          failed={Boolean(switches.error)}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Feature registry"
        subtitle="Every place this system is allowed to use AI at all, with how far each has been rolled out and what happens when it is switched off."
        meta={rows.length > 0 ? [{ label: "Registered", value: String(rows.length) }] : []}
      />

      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[13px] leading-5 text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">This list is closed.</span> A feature that is not
        registered here cannot be used: the router checks the key first and a call for anything else is rejected before
        it reaches a provider — no request is made and no data leaves. Adding a ninth feature is a code change with an
        approved design record, not a setting.
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.key}
        caption="Registered AI features, rollout stage, evaluation verdict and kill-switch state"
        empty={
          <Empty
            title="No AI features are registered"
            body="The registry is compiled into the platform, so an empty list means the API could not read it. Nothing can route until it can."
          />
        }
      />
    </div>
  );
}

/**
 * The kill-switch state for one feature, from the single bulk read.
 *
 * A tenant-wide switch shows as engaged on every row, which is correct: that is what it
 * does. A feature the bulk read did not mention shows as unknown rather than as allowed —
 * the wording fails closed even though nothing here can change the switch.
 */
function KillSwitchCell({
  state,
  loading,
  failed,
}: {
  state: KillSwitchState | null;
  loading: boolean;
  failed: boolean;
}): React.JSX.Element {
  if (loading) return <span className="text-[12px] text-[var(--text-muted)]">Checking…</span>;
  if (failed || !state) return <span className="text-[12px] text-[var(--text-muted)]">State unknown</span>;

  return state.routingAllowed ? (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
      <CircleCheck className="h-3.5 w-3.5 shrink-0 text-[var(--status-done-text)]" aria-hidden />
      Routing allowed
    </span>
  ) : (
    <span className="inline-flex items-start gap-1.5 text-[12px] text-[var(--text-primary)]">
      <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-rejected-text)]" aria-hidden />
      <span>{state.reason}</span>
    </span>
  );
}
