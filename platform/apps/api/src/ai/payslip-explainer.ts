import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AppError,
  checkPayslipGrounding,
  renderPayslipExplanation,
  type PayslipTrace,
} from "@ind-core/platform";
import { AI_ROUTER } from "./ai.tokens.js";
import type { AiRouterService } from "./ai-router.service.js";
import { StubProvider } from "./stub.provider.js";
import { OllamaProvider } from "./ollama.provider.js";

interface ReasonOutput {
  reason?: string;
}

/**
 * The prompt for `hrm.payslip_explainer` (AI #7).
 *
 * Note what the model is NOT asked to do. It does not check the payslip, decide whether a
 * figure is right, or suggest anything. Every number it is allowed to say is handed to it,
 * and the grounding gate rejects the sentence if it produces one that was not. That
 * division of labour is the finding recorded in `ai-verdict-in-code-wording-in-model`:
 * given room to conclude, a small model invents figures and copies examples.
 */
const SYSTEM = [
  "You rewrite a payroll explanation for a factory worker in simple, plain English.",
  "Keep every number EXACTLY as given. Never introduce a number, percentage or amount that",
  "is not in the text you are given, not even an example.",
  "Never say whether the pay is correct or incorrect. Never suggest an action, and never",
  "tell the reader to contact anyone. You are explaining, not advising.",
  "Two or three short sentences. No headings, no bullet points, no closing pleasantry.",
].join("\n");

function tidy(raw: string): string {
  return raw
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The ESS "Explain my payslip" drawer (HR-65) — registered **stretch**, **Tier-3
 * advisory-only-forever**, `pii_minimised`.
 *
 * Three properties make this safe enough to put in front of an employee:
 *
 *  1. **Nothing is computed here.** The trace arrives from the payslip, which was computed
 *     by the payroll engine and stored with its own working. The AI layer cannot change a
 *     figure because it never has one to change.
 *  2. **The registered deterministic baseline is a real product.** `payslip_trace_template`
 *     is a complete explanation on its own, and it is what ships when the model is off,
 *     refused by governance, over budget, or ungrounded. Degrading loses fluency, not
 *     meaning.
 *  3. **The name never leaves.** `dataClass: pii_minimised` is honoured literally — the
 *     model receives figures and a period label, never the employee.
 */
@Injectable()
export class PayslipExplainer implements OnModuleInit {
  constructor(
    @Inject(AI_ROUTER) private readonly router: AiRouterService,
    private readonly stub: StubProvider,
    private readonly ollama: OllamaProvider,
  ) {}

  onModuleInit(): void {
    // OFFLINE path — the registered baseline, zero spend, always correct.
    this.stub.register("hrm.payslip_explainer", (raw) => {
      const trace = raw as PayslipTrace;
      return { reason: renderPayslipExplanation(trace) } satisfies ReasonOutput;
    });

    // LIVE path — the model rewrites the baseline and must survive the grounding gate.
    this.ollama.register<PayslipTrace, ReasonOutput>("hrm.payslip_explainer", {
      system: SYSTEM,
      buildUser: (trace) =>
        // The employee's NAME is deliberately not sent. Everything the model needs is in
        // the rendered baseline, and it is asked only to say the same thing more plainly.
        `Rewrite this in plainer words, keeping every number identical:\n\n${renderPayslipExplanation(trace)}`,
      parse: (text, trace) => {
        const reason = tidy(text);
        const g = checkPayslipGrounding(reason, trace);
        if (!g.ok) {
          throw new AppError("AI_UNGROUNDED", 422, `payslip explanation rejected: ${g.reason ?? "unknown"}`);
        }
        return { reason };
      },
    });
  }

  /**
   * Explain a payslip. NEVER throws for governance or a model failure: the employee always
   * gets a correct explanation, marked `degraded` when the model could not contribute one.
   */
  async explain(trace: PayslipTrace): Promise<{ text: string; degraded: boolean }> {
    const baseline = renderPayslipExplanation(trace);
    try {
      const r = await this.router.complete<ReasonOutput>({
        featureKey: "hrm.payslip_explainer",
        input: trace,
      });
      const text = r.output.reason?.trim() ? r.output.reason.trim() : baseline;
      return { text, degraded: r.degraded ?? false };
    } catch (e) {
      if (e instanceof AppError && (e.code === "AI_REFUSED" || e.code === "AI_UNGROUNDED")) {
        return { text: baseline, degraded: true };
      }
      throw e;
    }
  }
}
