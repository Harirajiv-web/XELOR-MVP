import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AppError,
  checkGrounding,
  decideDuplicateVerdict,
  renderDeterministicReason,
  renderDuplicateNote,
  type DedupVerdict,
  type DuplicateMatch,
  type MasterRecord,
} from "@ind-core/platform";
import { AI_ROUTER } from "./ai.tokens.js";
import type { AiRouterService } from "./ai-router.service.js";
import { StubProvider } from "./stub.provider.js";
import { OllamaProvider } from "./ollama.provider.js";

export interface DuplicateExplainInput {
  candidate: MasterRecord;
  matches: DuplicateMatch[];
  /** Friendly labels per matched field, so the explanation reads naturally in each
   *  domain (e.g. { cin: "item code", legal_name: "name" } for ENGINEERING items). */
  fieldLabels?: Record<string, string>;
}

/** What the model is asked to return: ONE sentence of reasoning, nothing else. */
interface ReasonOutput {
  reason?: string;
}

/**
 * The system instruction for a live model. Deliberately narrow: the conclusion and the
 * recommended action are already decided in code (see dedup-verdict.ts for the measured
 * reason why), so the model's entire job is to phrase the evidence. Proven on a local 3B
 * model — the wider prompts that let it conclude produced dangerous output.
 */
const SYSTEM = [
  "You write ONE sentence for a factory manager, describing evidence an ERP has already checked.",
  "Describe the evidence ONLY. Never say whether the two records are the same business or",
  "different businesses, and never hint at it — that conclusion is already decided elsewhere",
  "and shown above your sentence.",
  "Use only the findings given. Never add a number, code or identifier that is not in them.",
  "Do not give advice. Do not use the words verdict, field or findings. One sentence only.",
].join("\n");

const quotesBalanced = (s: string): boolean => ((s.match(/"/g)?.length ?? 0) % 2 === 0);

/**
 * Trim the model's reply to a usable sentence or two before it is grounding-checked.
 * Naive sentence splitting cuts inside quoted names ("... Pvt. Ltd."), leaving a dangling
 * quote, so a truncation that unbalances the quotes is discarded in favour of the whole text.
 */
function tidy(raw: string): string {
  const flat = raw.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ");
  const sentences = flat.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) return flat;
  const trimmed = sentences.slice(0, 2).join(" ").trim();
  return quotesBalanced(trimmed) ? trimmed : flat;
}

function verdictOf(input: DuplicateExplainInput, top: DuplicateMatch): DedupVerdict {
  return decideDuplicateVerdict(input.candidate, top, input.fieldLabels ?? {});
}

/**
 * The SHARED brain surface for general.master_dedup (AI #2, Tier-2 draft-record). It is
 * part of the AI spine (not any one module) so EVERY module that owns masters — GENERAL
 * companies, ENGINEERING items, PURCHASE vendors — explains its rules-produced matches the
 * same way: via the router (governed + logged), with the verdict decided in code and only
 * the reason sentence written by the model. Degrades to a fully deterministic note when
 * governance refuses, the model is down, or the model's text fails the grounding check.
 */
@Injectable()
export class DedupExplainer implements OnModuleInit {
  constructor(
    @Inject(AI_ROUTER) private readonly router: AiRouterService,
    private readonly stub: StubProvider,
    private readonly ollama: OllamaProvider,
  ) {}

  onModuleInit(): void {
    // OFFLINE path — zero model spend, always correct, used in CI and as the fallback.
    this.stub.register("general.master_dedup", (raw) => {
      const input = raw as DuplicateExplainInput;
      const top = input.matches[0];
      return { reason: top ? renderDeterministicReason(verdictOf(input, top)) : "" } satisfies ReasonOutput;
    });

    // LIVE path — a real model writes only the reason, and must survive the grounding check.
    this.ollama.register<DuplicateExplainInput, ReasonOutput>("general.master_dedup", {
      system: SYSTEM,
      buildUser: (input) => {
        const top = input.matches[0];
        if (!top) return JSON.stringify({ findings: [] });
        const v = verdictOf(input, top);
        // Only `field` + `detail` cross the boundary — never our internal verdict tokens,
        // so the model has no vocabulary to leak and no conclusion to copy.
        return JSON.stringify({
          findings: v.findings.map((f) => ({ field: f.label, detail: f.detail })),
        });
      },
      parse: (text, input) => {
        const top = input.matches[0];
        if (!top) throw new AppError("AI_UNGROUNDED", 422, "no match to explain");
        const v = verdictOf(input, top);
        const reason = tidy(text);
        const g = checkGrounding(reason, v);
        if (!g.ok) {
          // Refuse the model's text outright; the provider degrades to deterministic.
          throw new AppError("AI_UNGROUNDED", 422, `model text rejected: ${g.reason ?? "unknown"}`);
        }
        return { reason };
      },
    });
  }

  /**
   * Explain the duplicate finding. NEVER throws for governance or a model failure — the
   * human always gets a correct note, degraded if the model could not contribute.
   */
  async explain(
    input: DuplicateExplainInput,
  ): Promise<{ text: string; degraded: boolean; verdict: DedupVerdict | null }> {
    const top = input.matches[0];
    if (!top) {
      return {
        text: `No likely duplicate found for '${input.candidate.legalName}'.`,
        degraded: false,
        verdict: null,
      };
    }
    const verdict = verdictOf(input, top);
    const deterministic = renderDeterministicReason(verdict);

    try {
      const r = await this.router.complete<ReasonOutput>({
        featureKey: "general.master_dedup",
        input,
      });
      const reason = r.output.reason?.trim() ? r.output.reason.trim() : deterministic;
      return { text: renderDuplicateNote(verdict, reason), degraded: r.degraded ?? false, verdict };
    } catch (e) {
      if (e instanceof AppError && e.code === "AI_REFUSED") {
        return { text: renderDuplicateNote(verdict, deterministic), degraded: true, verdict };
      }
      throw e;
    }
  }
}
