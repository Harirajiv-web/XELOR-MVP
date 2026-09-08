import { Injectable } from "@nestjs/common";
import {
  AGENT_REGISTRY,
  AppError,
  type AgentDefinition,
  type AgentKey,
} from "@ind-core/platform";

@Injectable()
export class AgentRegistryService {
  private readonly byKey = new Map(
    AGENT_REGISTRY.map((agent) => [agent.key, agent]),
  );

  list(): readonly AgentDefinition[] {
    return AGENT_REGISTRY;
  }

  get(key: AgentKey): AgentDefinition {
    const agent = this.byKey.get(key);
    if (!agent)
      throw new AppError(
        "AGENT_NOT_REGISTERED",
        404,
        `Agent '${key}' is not registered.`,
      );
    return agent;
  }

  assertCapabilityAllowed(agentKey: AgentKey, capabilityKey: string): void {
    const agent = this.get(agentKey);
    if (
      !agent.allowedCapabilityPrefixes.some((prefix) =>
        capabilityKey.startsWith(prefix),
      )
    ) {
      throw new AppError(
        "AGENT_CAPABILITY_FORBIDDEN",
        403,
        `${agentKey} is not permitted to invoke '${capabilityKey}'.`,
      );
    }
  }
}
