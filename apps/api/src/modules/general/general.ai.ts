import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { AppError } from "@ind-core/platform";
import { AI_ROUTER } from "../../ai/ai.tokens.js";
import type { AiRouterService } from "../../ai/ai-router.service.js";
import { StubProvider } from "../../ai/stub.provider.js";
import type { DuplicateMatch, MasterRecord } from "./dedup.core.js";

export interface DuplicateExplainInput {
  candidate: MasterRecord;
  matches: DuplicateMatch[];
}

/** Deterministic explanation from the evidence — used BOTH as the offline stub answer
 *  and as the degraded-mode fallback when a real model is refused by governance. */
function renderExplanation(input: DuplicateExplainInput): string {
  const top = input.matches[0];
  if (!top) return `No likely duplicate found for '${input.candidate.legalName}'.`;
  const pct = Math.round(top.score * 100);
  const others = input.matches.length > 1 ? ` (and ${input.matches.length - 1} more)` : "";
  return (
    `'${input.candidate.legalName}' looks like a ${top.level} match for the existing ` +
    `'${top.existingName}' — ${pct}% on ${top.matchedFields.join(", ")}${others}. ` +
    `Please confirm this is not a duplicate before creating it.`
  );
}

/**
 * GENERAL's "brain" surface for general.master_dedup (AI #2, Tier-2 draft-record). It
 * owns how the OFFLINE stub answers for this feature, and turns a rules-produced set of
 * duplicate matches into a human-readable explanation via the router (governed + logged).
 * If governance refuses the call (kill switch / opt-out / budget), it degrades to the
 * same deterministic sentence — the feature's declared `deterministic_substitute` mode.
 */
@Injectable()
export class GeneralDedupExplainer implements OnModuleInit {
  constructor(
    @Inject(AI_ROUTER) private readonly router: AiRouterService,
    private readonly stub: StubProvider,
  ) {}

  onModuleInit(): void {
    // Register the offline responder so dev/CI runs with zero model spend.
    this.stub.register("general.master_dedup", (input) =>
      ({ explanation: renderExplanation(input as DuplicateExplainInput) }),
    );
  }

  /** Explain the duplicate finding. Never throws for governance — degrades instead. */
  async explain(input: DuplicateExplainInput): Promise<{ text: string; degraded: boolean }> {
    try {
      const r = await this.router.complete<{ explanation?: string }>({
        featureKey: "general.master_dedup",
        input,
      });
      return { text: r.output.explanation ?? renderExplanation(input), degraded: r.degraded ?? false };
    } catch (e) {
      if (e instanceof AppError && e.code === "AI_REFUSED") {
        // Governance said no — fall back to the deterministic substitute (still useful).
        return { text: renderExplanation(input), degraded: true };
      }
      throw e;
    }
  }
}
