"use client";

import {
  MACHINE_COMMAND_CAPABILITIES,
  normalizeMachineCommandIntent,
  type FactoryAssetView,
  type MachineCommandCapability,
  type MachineCommandIntent,
  type MachineState,
} from "@ind-core/platform/factory-connect/contracts";
import { dateTime, humanise } from "@spine/format";
import { StatusBadge } from "@spine/ui/status-badge";

interface CommandField {
  key: string;
  label: string;
  required: boolean;
  kind?: "inspection";
}

const COMMAND_CONFIG: Readonly<
  Record<
    MachineCommandCapability,
    { label: string; states: readonly MachineState[]; fields: readonly CommandField[] }
  >
> = {
  "robot.job.enqueue": {
    label: "Queue approved robot job",
    states: ["idle"],
    fields: [
      { key: "jobId", label: "Job ID", required: true },
      { key: "productionOrderRef", label: "Production order", required: false },
    ],
  },
  "robot.program.select_approved": {
    label: "Select approved robot program",
    states: ["idle"],
    fields: [
      { key: "programId", label: "Program ID", required: true },
      { key: "approvedRevision", label: "Approved revision", required: true },
    ],
  },
  "robot.pause_after_cycle": {
    label: "Pause after the current cycle",
    states: ["running"],
    fields: [{ key: "reasonCode", label: "Reason code", required: true }],
  },
  "amr.route.dispatch": {
    label: "Dispatch approved AMR route",
    states: ["idle"],
    fields: [
      { key: "routeId", label: "Route ID", required: true },
      { key: "missionRef", label: "Mission reference", required: false },
    ],
  },
  "quality.output.quarantine": {
    label: "Quarantine recorded output",
    states: ["running", "idle", "blocked"],
    fields: [
      { key: "lotRef", label: "Lot reference", required: true },
      { key: "reasonCode", label: "Reason code", required: true },
    ],
  },
  "maintenance.inspection.request": {
    label: "Request maintenance inspection",
    states: ["idle", "blocked", "faulted", "protective_stop", "offline"],
    fields: [
      { key: "inspectionType", label: "Inspection type", required: true, kind: "inspection" },
      { key: "reasonCode", label: "Reason code", required: false },
    ],
  },
};

const INSPECTION_TYPES = ["visual", "mechanical", "electrical", "safety"] as const;
const SAFE_SAFETY_STATES = new Set(["normal", "ready", "safe", "clear"]);

export interface FactoryCommandDraft {
  assetCode: string;
  capability: MachineCommandCapability;
  parameters: Record<string, string>;
  requiredState: MachineState;
  ttlMinutes: 5 | 10 | 14;
}

type FactoryAssetContext = Readonly<{ assets: readonly FactoryAssetView[] }>;

function isCapability(value: string): value is MachineCommandCapability {
  return (MACHINE_COMMAND_CAPABILITIES as readonly string[]).includes(value);
}

function stateOf(asset: FactoryAssetView): MachineState | null {
  const state = asset.state as MachineState;
  return Object.values(COMMAND_CONFIG).some((config) => config.states.includes(state))
    ? state
    : null;
}

export function compatibleCapabilities(asset: FactoryAssetView): MachineCommandCapability[] {
  const state = stateOf(asset);
  if (!state) return [];
  return asset.commandPolicy.allowlistedCapabilities.filter(
    (capability): capability is MachineCommandCapability =>
      isCapability(capability) &&
      !asset.commandPolicy.forbidden?.includes(capability) &&
      COMMAND_CONFIG[capability].states.includes(state),
  );
}

export function commandableSimulatorAssets(overview: FactoryAssetContext): FactoryAssetView[] {
  return overview.assets.filter(
    (asset) =>
      asset.adapterMode === "simulator" &&
      asset.commandMode === "governed" &&
      SAFE_SAFETY_STATES.has(asset.safetyState.trim().toLowerCase()) &&
      compatibleCapabilities(asset).length > 0,
  );
}

function safeIdentifier(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim().replace(/[^A-Za-z0-9._:/-]+/g, "-").slice(0, 128);
  return normalized && /^[A-Za-z0-9]/.test(normalized) ? normalized : fallback;
}

function defaultParameters(
  asset: FactoryAssetView,
  capability: MachineCommandCapability,
): Record<string, string> {
  switch (capability) {
    case "robot.job.enqueue":
      return {
        jobId: safeIdentifier(asset.activeProgram, `JOB-${asset.assetCode}`),
        ...(asset.productionOrderRef
          ? { productionOrderRef: safeIdentifier(asset.productionOrderRef, "PRODUCTION-ORDER") }
          : {}),
      };
    case "robot.program.select_approved":
      return {
        programId: safeIdentifier(asset.activeProgram, "APPROVED-PROGRAM"),
        approvedRevision: "REV-1",
      };
    case "robot.pause_after_cycle":
      return { reasonCode: "RECOVERY_REVIEW" };
    case "amr.route.dispatch":
      return {
        routeId: "STAGING-TO-LINE",
        ...(asset.productionOrderRef
          ? { missionRef: safeIdentifier(asset.productionOrderRef, "FACTORY-RECOVERY") }
          : {}),
      };
    case "quality.output.quarantine":
      return {
        lotRef: safeIdentifier(
          asset.materialRef ?? asset.productionOrderRef,
          `${asset.assetCode}-OUTPUT`,
        ),
        reasonCode: "QUALITY_REVIEW",
      };
    case "maintenance.inspection.request":
      return {
        inspectionType: "visual",
        reasonCode: safeIdentifier(asset.alarmCode, "RECOVERY_CHECK"),
      };
  }
}

export function draftForAsset(asset: FactoryAssetView): FactoryCommandDraft | null {
  const capability = compatibleCapabilities(asset)[0];
  const requiredState = stateOf(asset);
  if (!capability || !requiredState) return null;
  return {
    assetCode: asset.assetCode,
    capability,
    parameters: defaultParameters(asset, capability),
    requiredState,
    ttlMinutes: 10,
  };
}

export function defaultFactoryCommandDraft(
  overview: FactoryAssetContext,
): FactoryCommandDraft | null {
  const asset = commandableSimulatorAssets(overview)[0];
  return asset ? draftForAsset(asset) : null;
}

export function buildFactoryCommandIntent(
  draft: FactoryCommandDraft,
  now = Date.now(),
): { valid: true; value: MachineCommandIntent } | { valid: false; reason: string } {
  return normalizeMachineCommandIntent({
    assetCode: draft.assetCode,
    capability: draft.capability,
    parameters: Object.fromEntries(
      Object.entries(draft.parameters).filter(([, value]) => value.trim().length > 0),
    ),
    requiredState: draft.requiredState,
    expiresAt: new Date(now + draft.ttlMinutes * 60_000).toISOString(),
  });
}

const PENDING_FACTORY_INTENT_KEY = "xelor:pending-factory-intent";

interface PendingFactoryIntent {
  actorKey: string;
  draftFingerprint: string;
  intent: MachineCommandIntent;
}

function factoryDraftFingerprint(draft: FactoryCommandDraft): string {
  return JSON.stringify({
    assetCode: draft.assetCode,
    capability: draft.capability,
    parameters: Object.fromEntries(Object.entries(draft.parameters).sort(([a], [b]) => a.localeCompare(b))),
    requiredState: draft.requiredState,
    ttlMinutes: draft.ttlMinutes,
  });
}

/** Seal a time-bounded intent until its launch receives a response, including across reloads. */
export function pendingFactoryCommandIntent(
  draft: FactoryCommandDraft,
  actorKey: string,
): { valid: true; value: MachineCommandIntent } | { valid: false; reason: string } {
  const draftFingerprint = factoryDraftFingerprint(draft);
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(PENDING_FACTORY_INTENT_KEY) ?? "null",
    ) as PendingFactoryIntent | null;
    if (stored?.actorKey === actorKey && stored.draftFingerprint === draftFingerprint) {
      const normalized = normalizeMachineCommandIntent(stored.intent);
      if (normalized.valid) return normalized;
    }
  } catch {
    // Fall through to a fresh sealed intent when storage is unavailable or malformed.
  }

  const created = buildFactoryCommandIntent(draft);
  if (!created.valid) return created;
  try {
    window.sessionStorage.setItem(
      PENDING_FACTORY_INTENT_KEY,
      JSON.stringify({ actorKey, draftFingerprint, intent: created.value } satisfies PendingFactoryIntent),
    );
  } catch {
    // The request remains server-idempotent; only cross-reload sealing is unavailable.
  }
  return created;
}

export function completePendingFactoryCommandIntent(intent: MachineCommandIntent): void {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(PENDING_FACTORY_INTENT_KEY) ?? "null",
    ) as PendingFactoryIntent | null;
    if (stored?.intent.expiresAt === intent.expiresAt) {
      window.sessionStorage.removeItem(PENDING_FACTORY_INTENT_KEY);
    }
  } catch {
    // A received successful response no longer depends on browser recovery state.
  }
}

export function readFactoryCommandIntent(value: unknown): MachineCommandIntent | null {
  const normalized = normalizeMachineCommandIntent(value, { enforceExpiryWindow: false });
  return normalized.valid ? normalized.value : null;
}

export function FactoryCommandComposer({
  overview,
  loading,
  error,
  canRead,
  canExecute,
  draft,
  onDraftChange,
  onRetry,
}: {
  overview: FactoryAssetContext | null;
  loading: boolean;
  error: unknown;
  canRead: boolean;
  canExecute: boolean;
  draft: FactoryCommandDraft | null;
  onDraftChange: (draft: FactoryCommandDraft | null) => void;
  onRetry: () => void;
}): React.JSX.Element {
  if (!canExecute) {
    return (
      <div className="mt-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[10.5px] leading-4 text-[var(--text-secondary)]">
        Your role may run a read-only Factory Flow analysis, but it cannot include or submit a simulator command. The separate <code>factory.command.execute</code> permission is required.
      </div>
    );
  }
  if (!canRead) {
    return (
      <div role="alert" className="mt-3 rounded-[10px] border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-3 text-[10.5px] leading-4 text-[var(--text-secondary)]">
        A command cannot be composed without permission to read the current production asset state.
      </div>
    );
  }
  if (loading) {
    return <p className="mt-3 text-[10.5px] text-[var(--text-muted)]">Reading simulator state and allowlists…</p>;
  }
  if (error) {
    return (
      <div role="alert" className="mt-3 rounded-[10px] border border-[var(--status-rejected-border)] bg-[var(--status-rejected-bg)] p-3 text-[10.5px] text-[var(--text-secondary)]">
        <p>Factory state could not be read, so no command intent can be approved.</p>
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  const assets = overview ? commandableSimulatorAssets(overview) : [];
  const fallbackAsset = assets[0];
  if (!overview || !fallbackAsset || !draft) {
    return (
      <div className="mt-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[10.5px] leading-4 text-[var(--text-secondary)]">
        No simulator asset currently has a safe reported state and a state-compatible allowlisted capability. The mission can still analyse evidence, but it cannot request a command.
      </div>
    );
  }

  const asset = assets.find((candidate) => candidate.assetCode === draft.assetCode) ?? fallbackAsset;
  const capabilities = compatibleCapabilities(asset);
  const config = COMMAND_CONFIG[draft.capability];

  return (
    <section className="mt-3 rounded-[11px] border border-[color-mix(in_srgb,var(--warn)_32%,var(--border-subtle))] bg-[var(--warn-soft)] p-3" aria-labelledby="factory-command-composer-title" data-testid="factory-command-composer">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="factory-command-composer-title" className="text-[12px] font-extrabold text-[var(--text-primary)]">Bounded simulator command intent</h3>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">This exact intent will be attached to the human approval. Launching the mission contacts no controller.</p>
        </div>
        <StatusBadge tone="draft" label="Simulator only" />
      </div>

      <div className="mt-3 grid gap-2">
        <label className="text-[10px] font-bold text-[var(--text-secondary)]">
          Simulator asset
          <select
            data-testid="factory-command-asset"
            className="mt-1 h-9 w-full rounded-[8px] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)]"
            value={asset.assetCode}
            onChange={(event) => {
              const next = assets.find((candidate) => candidate.assetCode === event.target.value);
              onDraftChange(next ? draftForAsset(next) : null);
            }}
          >
            {assets.map((candidate) => <option key={candidate.assetCode} value={candidate.assetCode}>{candidate.assetCode} · {candidate.name}</option>)}
          </select>
        </label>

        <label className="text-[10px] font-bold text-[var(--text-secondary)]">
          Allowlisted, state-compatible capability
          <select
            data-testid="factory-command-capability"
            className="mt-1 h-9 w-full rounded-[8px] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)]"
            value={draft.capability}
            onChange={(event) => {
              const capability = event.target.value as MachineCommandCapability;
              onDraftChange({
                ...draft,
                capability,
                parameters: defaultParameters(asset, capability),
              });
            }}
          >
            {capabilities.map((capability) => <option key={capability} value={capability}>{COMMAND_CONFIG[capability].label}</option>)}
          </select>
        </label>

        {config.fields.map((field) => (
          <label key={field.key} className="text-[10px] font-bold text-[var(--text-secondary)]">
            {field.label}{field.required ? " · required" : " · optional"}
            {field.kind === "inspection" ? (
              <select
                className="mt-1 h-9 w-full rounded-[8px] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)]"
                value={draft.parameters[field.key] ?? "visual"}
                onChange={(event) => onDraftChange({ ...draft, parameters: { ...draft.parameters, [field.key]: event.target.value } })}
              >
                {INSPECTION_TYPES.map((inspection) => <option key={inspection} value={inspection}>{humanise(inspection)}</option>)}
              </select>
            ) : (
              <input
                data-testid={`factory-command-parameter-${field.key}`}
                className="mt-1 h-9 w-full rounded-[8px] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)]"
                value={draft.parameters[field.key] ?? ""}
                required={field.required}
                maxLength={128}
                pattern="[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}"
                onChange={(event) => onDraftChange({ ...draft, parameters: { ...draft.parameters, [field.key]: event.target.value } })}
              />
            )}
          </label>
        ))}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface)] p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Required current state</p>
            <p className="mt-1 text-[11px] font-semibold text-[var(--text-primary)]">{humanise(draft.requiredState)}</p>
            <p className="mt-1 text-[9px] text-[var(--text-muted)]">Reported {asset.observedAt ? dateTime(asset.observedAt) : "time unavailable"} · safety {humanise(asset.safetyState)}</p>
          </div>
          <label className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface)] p-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Approval expiry
            <select
              data-testid="factory-command-ttl"
              className="mt-1 h-8 w-full rounded-[7px] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[11px] font-semibold normal-case tracking-normal text-[var(--text-primary)]"
              value={draft.ttlMinutes}
              onChange={(event) => onDraftChange({ ...draft, ttlMinutes: Number(event.target.value) as 5 | 10 | 14 })}
            >
              <option value={5}>5 minutes after launch</option>
              <option value={10}>10 minutes after launch</option>
              <option value={14}>14 minutes after launch</option>
            </select>
          </label>
        </div>
      </div>

      <p className="mt-3 text-[9.5px] leading-4 text-[var(--text-muted)]">At submission, the server rechecks the exact approval, expiry, current state, state freshness, safety state, asset allowlist and gateway mode. A simulator result is evidence only; no physical controller is contacted.</p>
    </section>
  );
}

export function FactoryCommandIntentView({
  intent,
  title = "Exact command intent under review",
}: {
  intent: MachineCommandIntent;
  title?: string;
}): React.JSX.Element {
  return (
    <section className="rounded-[11px] border border-[color-mix(in_srgb,var(--warn)_35%,var(--border-subtle))] bg-[var(--surface)] p-3" data-testid="factory-command-intent" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-extrabold text-[var(--text-primary)]">{title}</h3>
        <StatusBadge tone="draft" label="Simulator intent" />
      </div>
      <dl className="mt-3 grid gap-2 text-[10.5px] sm:grid-cols-2">
        <IntentFact label="Asset" value={intent.assetCode} />
        <IntentFact label="Capability" value={intent.capability} mono />
        <IntentFact label="Required state" value={humanise(intent.requiredState)} />
        <IntentFact label="Expires" value={dateTime(intent.expiresAt)} />
      </dl>
      <div className="mt-2 rounded-[8px] bg-[var(--surface-sunken)] p-2.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Strict parameters</p>
        <dl className="mt-1 grid gap-1">
          {Object.entries(intent.parameters).map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-3 text-[10px]">
              <dt className="text-[var(--text-muted)]">{humanise(key)}</dt>
              <dd className="break-all font-[var(--font-mono)] text-right text-[var(--text-primary)]">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-2 text-[9.5px] leading-4 text-[var(--text-muted)]">Approval is bound to these exact fields. It does not itself submit a command, contact a controller or bypass the controller and safety PLC.</p>
    </section>
  );
}

function IntentFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div>
      <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</dt>
      <dd className={`mt-0.5 break-all text-[var(--text-primary)] ${mono ? "font-[var(--font-mono)]" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
