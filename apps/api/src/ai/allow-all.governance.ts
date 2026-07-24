import { Injectable } from "@nestjs/common";
import type { AiUsage } from "@ind-core/platform";
import type { AiGovernance, AiGovernanceDecision } from "./governance.port.js";

/**
 * A1 placeholder governance: allows every call. Exists so the router can be built and
 * verified against a stable interface. A2 swaps in the real kill-switch / opt-out /
 * token-budget implementation without the router changing a line.
 */
@Injectable()
export class AllowAllGovernance implements AiGovernance {
  async check(_featureKey: string): Promise<AiGovernanceDecision> {
    return { allowed: true };
  }
  async recordUsage(_featureKey: string, _usage: AiUsage): Promise<void> {
    // no-op until A2
  }
}
