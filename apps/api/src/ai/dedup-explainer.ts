import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { AppError, type DuplicateMatch, type MasterRecord } from "@ind-core/platform";
import { AI_ROUTER } from "./ai.tokens.js";
import type { AiRouterService } from "./ai-router.service.js";
import { StubProvider } from "./stub.provider.js";

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
 * The SHARED brain surface for general.master_dedup (AI #2, Tier-2 draft-record). It is
 * part of the AI spine (not any one module) so EVERY module that owns masters — GENERAL
 * companies, ENGINEERING items, later vendors/customers — turns its rules-produced
 * matches into a human-readable explanation the same way: via the router (governed +
 * logged), degrading to a deterministic sentence if governance refuses the call.
 */
@Injectable()
export class DedupExplainer implements OnModuleInit {
  constructor(
    @Inject(AI_ROUTER) private readonly router: AiRouterService,
    private readonly stub: StubProvider,
  ) {}

  onModuleInit(): void {
    // Register the offline responder once so dev/CI runs with zero model spend.
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
        return { text: renderExplanation(input), degraded: true };
      }
      throw e;
    }
  }
}
