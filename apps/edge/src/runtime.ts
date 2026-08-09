import { createHash } from "node:crypto";
import {
  MAX_MACHINE_COMMAND_TTL_MS,
  MACHINE_COMMAND_CAPABILITIES,
  normalizeMachineCommandParameters,
  type MachineCommandCapability,
} from "@ind-core/platform";

export interface EdgeStateEvent {
  assetCode: string;
  sourceEventId: string;
  observedAt: string;
  state: "running" | "idle" | "blocked" | "faulted" | "protective_stop" | "offline";
  safetyState: string;
  activeProgram?: string;
  productionOrderRef?: string;
  materialRef?: string;
  goodCount?: number;
  rejectCount?: number;
  energyKwh?: number;
  alarmCode?: string;
  evidence?: Record<string, unknown>;
}

export interface EdgeCommand {
  commandKey: string;
  assetCode: string;
  capability: MachineCommandCapability;
  parameters: Record<string, unknown>;
  expiresAt: string;
}

interface EdgeResult {
  acknowledged: boolean;
  evidence: Record<string, unknown>;
}

export interface LocalControllerAdapter {
  readonly kind: "simulator" | "opcua" | "mqtt" | "ros2" | "vendor";
  readState(): Promise<EdgeStateEvent[]>;
  capabilitiesFor(assetCode: string): readonly MachineCommandCapability[];
  checkSafety(command: EdgeCommand): Promise<{ ready: boolean; reason: string }>;
  execute(command: EdgeCommand): Promise<EdgeResult>;
}

function fingerprint(command: EdgeCommand): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        assetCode: command.assetCode,
        capability: command.capability,
        parameters: Object.fromEntries(
          Object.entries(command.parameters).sort(([left], [right]) => left.localeCompare(right)),
        ),
        expiresAt: command.expiresAt,
      }),
      "utf8",
    )
    .digest("hex");
}

function refusal(reason: string): EdgeResult & { replayed: false } {
  return { acknowledged: false, evidence: { reason }, replayed: false };
}

/**
 * Process-local simulator boundary: validate, single-flight duplicate keys, ask the local
 * adapter for safety, then execute one named capability. This is not durable exactly-once
 * delivery; a certified physical adapter still needs a persisted command journal and a
 * mutually authenticated claim/ack protocol.
 */
export class EdgeRuntime {
  private readonly completed = new Map<string, EdgeResult & { fingerprint: string }>();
  private readonly inFlight = new Map<string, { fingerprint: string; promise: Promise<EdgeResult> }>();

  constructor(private readonly adapter: LocalControllerAdapter) {}

  async execute(command: EdgeCommand): Promise<EdgeResult & { replayed: boolean }> {
    // The runtime is importable, so a CLI/config check is not a safety boundary. Until a
    // certified claim/ack transport and durable journal exist, every physical adapter is
    // refused here before capability, safety or execute callbacks can run.
    if (this.adapter.kind !== "simulator") {
      return refusal(
        `Adapter '${this.adapter.kind}' is read-only: physical command transport is unavailable.`,
      );
    }
    if (
      typeof command.commandKey !== "string" ||
      command.commandKey.trim().length === 0 ||
      typeof command.assetCode !== "string" ||
      command.assetCode.trim().length === 0
    ) {
      return refusal("Command key and asset code are required.");
    }
    if (!(MACHINE_COMMAND_CAPABILITIES as readonly string[]).includes(command.capability)) {
      return refusal("Capability is not in the closed edge catalogue.");
    }
    const parameters = normalizeMachineCommandParameters(command.capability, command.parameters);
    if (!parameters.valid) return refusal(parameters.reason);
    const expiryMs = Date.parse(command.expiresAt);
    const now = Date.now();
    if (!Number.isFinite(expiryMs) || expiryMs <= now) {
      return refusal("Command expiry is invalid or elapsed before local execution.");
    }
    if (expiryMs - now > MAX_MACHINE_COMMAND_TTL_MS) {
      return refusal("Command expiry exceeds the 15-minute edge maximum.");
    }

    const normalized: EdgeCommand = {
      ...command,
      commandKey: command.commandKey.trim(),
      assetCode: command.assetCode.trim(),
      parameters: parameters.value,
      expiresAt: new Date(expiryMs).toISOString(),
    };
    const commandFingerprint = fingerprint(normalized);
    const prior = this.completed.get(normalized.commandKey);
    if (prior) {
      if (prior.fingerprint !== commandFingerprint) {
        return refusal("Command key was reused with a different payload.");
      }
      return { acknowledged: prior.acknowledged, evidence: prior.evidence, replayed: true };
    }
    const active = this.inFlight.get(normalized.commandKey);
    if (active) {
      if (active.fingerprint !== commandFingerprint) {
        return refusal("Command key is already executing with a different payload.");
      }
      const result = await active.promise;
      return { ...result, replayed: true };
    }

    const allowedForAsset = this.adapter.capabilitiesFor(normalized.assetCode);
    if (!allowedForAsset.includes(normalized.capability)) {
      return refusal(`Asset '${normalized.assetCode}' has not mapped capability '${normalized.capability}'.`);
    }

    const promise = this.executeOnce(normalized);
    this.inFlight.set(normalized.commandKey, { fingerprint: commandFingerprint, promise });
    try {
      const result = await promise;
      if (result.acknowledged) {
        this.completed.set(normalized.commandKey, { ...result, fingerprint: commandFingerprint });
      }
      return { ...result, replayed: false };
    } finally {
      const current = this.inFlight.get(normalized.commandKey);
      if (current?.promise === promise) this.inFlight.delete(normalized.commandKey);
    }
  }

  private async executeOnce(command: EdgeCommand): Promise<EdgeResult> {
    const safety = await this.adapter.checkSafety(command);
    if (!safety.ready) {
      return {
        acknowledged: false,
        evidence: { reason: safety.reason, localControllerRemainsSafetyAuthority: true },
      };
    }
    return this.adapter.execute(command);
  }

  readState(): Promise<EdgeStateEvent[]> {
    return this.adapter.readState();
  }
}

const SIMULATOR_CAPABILITIES: Readonly<Record<string, readonly MachineCommandCapability[]>> = {
  "ROBOT-CELL-03": [
    "robot.job.enqueue",
    "robot.program.select_approved",
    "robot.pause_after_cycle",
    "quality.output.quarantine",
    "maintenance.inspection.request",
  ],
  "AMR-07": ["amr.route.dispatch"],
};

export class FactorySimulatorAdapter implements LocalControllerAdapter {
  readonly kind = "simulator" as const;

  async readState(): Promise<EdgeStateEvent[]> {
    return [
      {
        assetCode: "ROBOT-CELL-03",
        sourceEventId: `sim-${Date.now()}`,
        observedAt: new Date().toISOString(),
        state: "blocked",
        safetyState: "normal",
        activeProgram: "PX400_SHAFT_LOAD_V4",
        productionOrderRef: "PO-2627-00002",
        materialRef: "BATCH-B-204",
        goodCount: 28,
        rejectCount: 0,
        energyKwh: 41.27,
        alarmCode: "MATERIAL_NOT_PRESENT",
        evidence: { source: "edge_simulator", boundary: "No physical controller is connected." },
      },
    ];
  }

  capabilitiesFor(assetCode: string): readonly MachineCommandCapability[] {
    return SIMULATOR_CAPABILITIES[assetCode] ?? [];
  }

  async checkSafety(command: EdgeCommand): Promise<{ ready: boolean; reason: string }> {
    return {
      ready: this.capabilitiesFor(command.assetCode).includes(command.capability),
      reason: "Simulator asset/capability mapping accepted; no physical safety system was queried.",
    };
  }

  async execute(command: EdgeCommand): Promise<EdgeResult> {
    return {
      acknowledged: true,
      evidence: {
        outcome: "simulated",
        capability: command.capability,
        note: "No robot, PLC or AMR was contacted.",
        localControllerRemainsSafetyAuthority: true,
        replayGuarantee: "process_local_only",
      },
    };
  }
}
