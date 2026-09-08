import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AppError,
  cannedReplyTemplate,
  checkReplyDraft,
  summariseThread,
  DRAFT_BANNER,
  type ReplyContext,
  type ReplyDraft,
} from "@ind-core/platform";
import { AI_ROUTER } from "./ai.tokens.js";
import type { AiRouterService } from "./ai-router.service.js";
import { StubProvider } from "./stub.provider.js";
import { OllamaProvider } from "./ollama.provider.js";

/**
 * The prompt for `csp.reply_draft` (AI #6) — STRETCH, Tier-2 (draft-record),
 * baseline `canned_response_template`, degraded mode `feature_hidden`.
 *
 * The instruction list is longer than any other feature's in this codebase, and every line
 * of it exists because a support reply is a statement a company makes to its customer.
 * The model may report what is already on the ticket. It may not promise, decide, price,
 * or apologise on the company's behalf.
 */
const SYSTEM = [
  "You draft a reply from a manufacturer's service desk to a customer, for a human agent to review.",
  "Use only facts present in the material you are given. Never introduce a number, a date, a",
  "price or a part that is not already there.",
  "Never promise anything: no replacement, no refund, no repair, no free-of-charge work, no",
  "delivery date, no resolution date. You have no authority to commit the company to anything.",
  "Never say whether something is a defect, whose fault it is, or whether it is covered.",
  "Coverage is decided elsewhere; if a coverage verdict is given to you, you may repeat it, and",
  "if none is given you must not mention warranty or AMC at all.",
  "Never mention an internal document, an internal team member, a cost, or an NCR.",
  "Never say that you are an AI. Write as the service desk, in plain professional English.",
  "Three or four short sentences. No bullet points, no signature block.",
].join("\n");

function tidy(raw: string): string {
  return raw.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();
}

export type TemplateKind = "acknowledge" | "awaiting_info" | "resolved" | "under_quality_review";

export interface DraftResult extends ReplyDraft {
  degraded: boolean;
  /** Present when a generated draft was refused and the template was used instead. */
  refusedReason?: string;
  summary: string;
}

/**
 * REPLY DRAFTING — assistive, never autonomous.
 *
 * The blueprint names the lesson this feature is built around: assistive drafting is where
 * the evidence is good, and autonomy is where it broke publicly. So the rule here is
 * absolute and structural rather than a matter of care — **a draft is never sent.** It is
 * returned with `sent: false` and stored as a comment with `author_type = 'ai_draft'`, a
 * value the customer-visibility rule excludes and a database CHECK constraint forbids from
 * ever carrying a `sent_at`. It becomes a message when a human presses send, and that act
 * rewrites the author and stamps the sender.
 *
 * Degrading is `feature_hidden` for the MODEL, not for the agent: the canned templates are
 * the registered baseline and they are a complete product on their own. An agent whose
 * tenant has AI switched off still gets a four-template picker and a thread summary
 * assembled from the record. What they lose is fluency, not function.
 */
@Injectable()
export class ReplyDrafter implements OnModuleInit {
  constructor(
    @Inject(AI_ROUTER) private readonly router: AiRouterService,
    private readonly stub: StubProvider,
    private readonly ollama: OllamaProvider,
  ) {}

  onModuleInit(): void {
    // OFFLINE path — the registered baseline. A real reply, with no model involved.
    this.stub.register("csp.reply_draft", (raw) => {
      const ctx = raw as ReplyContext & { kind?: TemplateKind };
      return cannedReplyTemplate(ctx.kind ?? "acknowledge", ctx);
    });

    // LIVE path — the model writes, and the gate decides whether anyone ever sees it.
    this.ollama.register<ReplyContext & { kind?: TemplateKind }, ReplyDraft>("csp.reply_draft", {
      system: SYSTEM,
      buildUser: (ctx) =>
        [
          `Ticket ${ctx.ticketNo}: "${ctx.subject}" (currently ${ctx.status}).`,
          ctx.entitlementResult
            ? `A coverage check has been run and the verdict is: ${ctx.entitlementResult.replace(/_/g, " ")}.`
            : "No coverage check has been run on this ticket.",
          ctx.slaPromise ? `The customer was told: ${ctx.slaPromise}.` : "",
          "",
          "The conversation so far (this is everything the customer can see):",
          ...ctx.publicThread.map((c) => `${c.author === "customer" ? "Customer" : "Service desk"}: ${c.body}`),
          "",
          "Draft the next reply from the service desk.",
        ]
          .filter((l) => l !== undefined)
          .join("\n"),
      parse: (text, ctx) => {
        const body = tidy(text);
        const gate = checkReplyDraft(body, ctx);
        if (!gate.ok) {
          throw new AppError("AI_UNGROUNDED", 422, `reply draft rejected: ${gate.reason ?? "unknown"}`);
        }
        return { body, source: "model", sent: false, banner: DRAFT_BANNER };
      },
    });
  }

  /**
   * Draft a reply. NEVER throws for governance or a model failure, and never returns
   * something that has not passed the gate: a refused draft degrades to the canned
   * template, which is itself gate-checked before it is handed back.
   */
  async draft(ctx: ReplyContext, kind: TemplateKind = "acknowledge"): Promise<DraftResult> {
    const baseline = cannedReplyTemplate(kind, ctx);
    const summary = summariseThread(ctx);
    try {
      const r = await this.router.complete<ReplyDraft>({
        featureKey: "csp.reply_draft",
        input: { ...ctx, kind },
      });
      const body = r.output?.body?.trim();
      if (!body) return { ...baseline, degraded: true, summary };

      // Belt and braces: the gate runs again on this side of the router, so a provider
      // that ever forgot to call `parse` still cannot produce a sendable draft.
      const gate = checkReplyDraft(body, ctx);
      if (!gate.ok) {
        return { ...baseline, degraded: true, refusedReason: gate.reason, summary };
      }
      return {
        body,
        source: r.output.source ?? "model",
        sent: false,
        banner: DRAFT_BANNER,
        degraded: r.degraded ?? false,
        summary,
      };
    } catch (e) {
      if (e instanceof AppError && ["AI_REFUSED", "AI_UNGROUNDED", "AI_FEATURE_NOT_ROUTABLE"].includes(e.code)) {
        return { ...baseline, degraded: true, refusedReason: e.code, summary };
      }
      throw e;
    }
  }
}
