import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors, listIntents } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { CopilotService } from "./copilot.service.js";

const askSchema = z.object({
  question: z.string().min(1).max(500),
  /** Set when the user clicked a suggestion rather than typing. Still validated. */
  intentKey: z.string().max(80).optional(),
});

const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function badRequest(issues: z.ZodIssue[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join(".") || "body", message: i.message })));
}

/**
 * THE COPILOT — `/api/v1/copilot`.
 *
 * Four routes, and what is ABSENT from them is the design. There is no endpoint that runs
 * a query the caller supplies, none that takes SQL, none that creates, updates, approves
 * or cancels anything, and none that reads another tenant. Those absences are how the
 * read-only promise is kept: not by a rule the code follows, but by there being nothing
 * to call.
 *
 * `ask` is a POST despite being a read. A question can run to 500 characters and would sit
 * in server logs, proxy logs and browser history as a query string otherwise — and the
 * questions people ask an ERP ("why is Sundaram's payment late") are themselves business
 * information.
 */
@Controller("copilot")
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  /** Ask a question. Always answers something — including "I cannot answer that". */
  @Post("ask")
  @RequirePermission("copilot.question.ask")
  async ask(@Body() body: unknown) {
    const p = askSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.copilot.ask(p.data.question, p.data.intentKey);
  }

  /**
   * What this user can and cannot ask.
   *
   * Both halves are returned on purpose. Showing only the permitted questions would leave
   * someone hunting for a capability that exists but is not theirs; naming it with the
   * permission it needs turns a dead end into a sentence they can take to an administrator.
   */
  @Get("capabilities")
  @RequirePermission("copilot.question.ask")
  async capabilities() {
    return this.copilot.capabilities();
  }

  /** The full catalogue, permissions included — the copilot's own documentation. */
  @Get("catalogue")
  @RequirePermission("copilot.question.ask")
  async catalogue() {
    return listIntents().map((i) => ({
      key: i.key,
      question: i.question,
      module: i.module,
      needsPermission: i.permission,
      examples: i.examples,
      parameters: i.params.map((p) => ({ name: p.name, required: p.required, description: p.description })),
      maxRows: i.rowCap,
    }));
  }

  /** Who asked what, and what each answer was drawn from. */
  @Get("history")
  @RequirePermission("copilot.log.read")
  async history(@Query() query: unknown) {
    const p = historySchema.safeParse(query ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.copilot.history(p.data.limit);
  }
}
