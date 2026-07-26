import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { AppError, groundExplanation, type SodFinding } from "@ind-core/platform";
import { AI_ROUTER } from "./ai.tokens.js";
import type { AiRouterService } from "./ai-router.service.js";
import { StubProvider } from "./stub.provider.js";
import { OllamaProvider } from "./ollama.provider.js";

interface ExplanationOutput {
  text?: string;
}

/**
 * The system instruction. Narrower than any other feature's, because this one sits on the
 * access-control plane: the conclusion is a control verdict, and a model that can reword a
 * control verdict can eventually reverse one.
 *
 * The model is not told the risk level, the enforcement mode, or what to recommend. It is
 * given two role names and one sentence of consequence, and asked to say the same thing to
 * a plant manager. Everything else it might have leaned on is deliberately absent from the
 * prompt, so there is nothing available to invent from.
 */
const SYSTEM = [
  "You rewrite ONE sentence for a factory manager who is not technical.",
  "You are given a person's name, two job roles they hold, and why holding both is a problem.",
  "Say the same thing more plainly. Add nothing.",
  "Never name a role that is not given to you. Never say how serious it is. Never recommend anything.",
  "Never say the combination is acceptable, safe, or not a problem.",
  "Never say that anything has been changed, removed or granted — you cannot do those things.",
  "One or two sentences. No lists, no headings.",
].join("\n");

function tidy(raw: string): string {
  const flat = raw.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ");
  const sentences = flat.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) return flat;
  return sentences.slice(0, 2).join(" ").trim();
}

/**
 * AI #8 — `admin.sod_explain` (stretch, Tier 3: advisory forever).
 *
 * The deterministic `sod_rule` matrix decides that a conflict exists. This only phrases it.
 * The grounding gate runs twice — once inside the provider's `parse` so the router itself
 * degrades on a bad draft, and again in the service before anything is stored — because
 * this is the one feature whose output sits next to an access-control decision, and the
 * cost of a wrong sentence there is an administrator deciding not to act on a real
 * conflict.
 *
 * Its degraded mode is `template_output`: the static sentence, which is also its
 * deterministic baseline. When AI is off, over budget, killed, or ungrounded, the product
 * is unchanged — only slightly less readable.
 */
@Injectable()
export class SodExplainer implements OnModuleInit {
  constructor(
    @Inject(AI_ROUTER) private readonly router: AiRouterService,
    private readonly stub: StubProvider,
    private readonly ollama: OllamaProvider,
  ) {}

  onModuleInit(): void {
    // OFFLINE path: the template sentence, which is exactly the baseline the eval measures
    // against. The stub does not pretend to do better than the thing it is standing in for.
    this.stub.register("admin.sod_explain", (raw) => {
      const f = raw as SodFinding;
      return { text: f.templateExplanation } satisfies ExplanationOutput;
    });

    this.ollama.register<SodFinding, ExplanationOutput>("admin.sod_explain", {
      system: SYSTEM,
      // Only the person, the two roles and the consequence cross the boundary. The risk
      // level and enforcement mode are withheld on purpose: the model cannot misstate a
      // fact it was never given.
      buildUser: (f) =>
        JSON.stringify({
          person: f.subjectName,
          roles: [f.roleACode, f.roleBCode],
          why: f.description,
        }),
      parse: (text, f) => {
        const cleaned = tidy(text);
        const gate = groundExplanation(f, cleaned);
        if (!gate.ok) {
          throw new AppError("AI_UNGROUNDED", 422, `explanation rejected: ${gate.violations.join("; ")}`);
        }
        return { text: cleaned };
      },
    });
  }

  /**
   * Never throws for governance or a model failure. The caller always receives a correct
   * sentence — the template one when the model could not contribute.
   */
  async explain(finding: SodFinding): Promise<{ text: string; degraded: boolean; model: string }> {
    try {
      const r = await this.router.complete<ExplanationOutput>({
        featureKey: "admin.sod_explain",
        input: finding,
      });
      const text = r.output.text?.trim();
      if (!text) {
        return { text: finding.templateExplanation, degraded: true, model: "template" };
      }
      return { text, degraded: r.degraded ?? false, model: r.model ?? "unknown" };
    } catch (e) {
      if (e instanceof AppError && (e.code === "AI_REFUSED" || e.code === "AI_UNGROUNDED")) {
        return { text: finding.templateExplanation, degraded: true, model: "template" };
      }
      throw e;
    }
  }
}
