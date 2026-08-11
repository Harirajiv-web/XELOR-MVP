import { Body, Controller, Get, Param, Post, Sse } from "@nestjs/common";
import { z } from "zod";
import { Observable } from "rxjs";
import { Errors, SOURCE_CATALOGUE, currentTenant, runWithTenant } from "@ind-core/platform";
import { RequirePermission } from "../common/permission.guard.js";
import { CHAPTERS, FulfilmentMissionService, isMissionStopStatus } from "./mission.service.js";
import { AUTONOMY_TIERS } from "./scenario.js";

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "try_another"]),
  note: z.string().min(3).max(500),
});

/**
 * THE MISSION API.
 *
 * `advance` runs ONE step and returns it. The stream endpoint below calls it in a loop and
 * pushes each result as a server-sent event — which is why the pacing lives here rather
 * than in the service: the service should not know or care that somebody is watching.
 *
 * The pacing is real work plus a small deliberate pause, and the pause is defensible rather
 * than theatrical. Research on agent interfaces is consistent that streaming intermediate
 * steps cuts *perceived* wait by up to 80% and that trust rises specifically because the
 * reasoning becomes visible at the same speed as the conclusion. A mission that computed
 * thirteen steps in 40ms and painted them all at once would be both faster and less
 * legible — nobody could see that the evidence preceded the decision, which is the single
 * property this product is asking to be believed on.
 *
 * So: the steps stream in the order they were computed, at a speed a person can read.
 * Nothing is invented during the pause and no result is withheld.
 */
@Controller("fulfilment")
export class FulfilmentController {
  constructor(private readonly missions: FulfilmentMissionService) {}

  /**
   * The vocabulary the UI renders: the autonomy tiers and the six chapters.
   *
   * Served rather than duplicated in the client. The tier list is the same object the
   * planner reads its rupee envelope from, so a dial rendered from this endpoint cannot
   * offer a setting the engine does not honour — which is exactly the drift that turns a
   * governance control into decoration.
   */
  @Get("meta")
  @RequirePermission("agentos.run.read")
  meta() {
    return { data: { autonomyTiers: AUTONOMY_TIERS, chapters: CHAPTERS, sources: SOURCE_CATALOGUE } };
  }

  /**
   * WHERE PHASE 2 GETS ITS FACTS — and, just as importantly, where it does not.
   *
   * Three lists: our own Phase 1 modules, which are genuinely connected and read live; the
   * two facts Phase 1 has no table for, which are stood in for and labelled everywhere they
   * surface; and the connector shelf — SAP, Tally, Odoo, Dynamics 365, MES/SCADA,
   * Excel/CSV, REST, Database — every one of which is `connected: false`.
   *
   * The shelf is on screen because the same Phase 2 layer is designed to sit on somebody
   * else's Phase 1, which is a real product claim. It carries no green lights, because a
   * demo that implied a live SAP connection would make every true thing beside it worthless.
   */
  @Get("sources")
  @RequirePermission("agentos.run.read")
  sources() {
    return { data: SOURCE_CATALOGUE };
  }

  /**
   * The nine demo scenarios, answered against THIS tenant's records.
   *
   * Each row says whether it can genuinely run, on which sales order, and what to watch for
   * — or says it cannot, and names the record somebody would have to create. Nothing here
   * makes the mission behave differently; it only chooses which order and which policy
   * setting, so that the behaviour being demonstrated actually shows up.
   */
  @Get("scenarios")
  @RequirePermission("agentos.run.read")
  async scenarios() {
    return { data: await this.missions.scenarios() };
  }

  /** Set a scenario up and open its mission. Refuses, with the reason, if it cannot occur. */
  @Post("scenarios/:key/start")
  @RequirePermission("agentos.run.operate")
  async startScenario(@Param("key") key: string) {
    return { data: await this.missions.startScenario(key) };
  }

  /** A blank supplier price list in the shape the upload below accepts. */
  @Get("sources/spreadsheet-template")
  @RequirePermission("agentos.run.read")
  template() {
    return { data: this.missions.supplierTermsTemplate() };
  }

  /** Confirmed orders and whether each already has a mission. */
  @Get("startable")
  @RequirePermission("sales.order.read")
  async startable() {
    return { data: await this.missions.startable() };
  }

  @Get("missions")
  @RequirePermission("agentos.run.read")
  async list() {
    return { data: await this.missions.list() };
  }

  @Get("missions/:id")
  @RequirePermission("agentos.run.read")
  async get(@Param("id") id: string) {
    return { data: await this.missions.view(requireUuid(id, "mission")) };
  }

  /** Open a mission on a confirmed order. Idempotent — a second call returns the first. */
  @Post("missions")
  @RequirePermission("agentos.run.operate")
  async start(@Body() body: unknown) {
    const parsed = z
      .object({
        salesOrderId: z.string().uuid(),
        // Defaults to "act within limits" rather than to the most permissive tier. A
        // caller that forgets to say how much authority it is granting has not granted
        // the most.
        tier: z.enum(["A2", "A3", "A4"]).default("A3"),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return { data: await this.missions.start(parsed.data.salesOrderId, parsed.data.tier) };
  }

  /** Run one step. The manual control, for anyone who wants to drive it themselves. */
  @Post("missions/:id/advance")
  @RequirePermission("agentos.run.operate")
  async advance(@Param("id") id: string) {
    return { data: await this.missions.advance(requireUuid(id, "mission")) };
  }

  /**
   * Run the arc, streaming each step as it completes.
   *
   * The tenant context has to be captured HERE and re-established inside the generator.
   * `runWithTenant` uses AsyncLocalStorage, and an SSE generator resumes on a later tick of
   * the event loop with the request's async context already unwound — so a naive
   * implementation reads `app.current_tenant` as unset, RLS matches nothing, and the stream
   * emits a mission with no steps rather than an error anybody could diagnose.
   */
  @Sse("missions/:id/stream")
  @RequirePermission("agentos.run.operate")
  stream(@Param("id") id: string): Observable<{ data: string }> {
    const missionId = requireUuid(id, "mission");
    const ctx = currentTenant();

    return new Observable((subscriber) => {
      let cancelled = false;

      void (async () => {
        try {
          for (let i = 0; i < 20 && !cancelled; i++) {
            const result = await runWithTenant(ctx, () => this.missions.advance(missionId));
            if (!result.step) {
              subscriber.next({ data: JSON.stringify({ type: "end", status: result.status, reason: result.reason }) });
              break;
            }
            subscriber.next({ data: JSON.stringify({ type: "step", step: result.step, status: result.status }) });
            if (isMissionStopStatus(result.status)) {
              const reason = result.status === "awaiting_approval"
                ? "a human decision is required"
                : result.status === "waiting"
                  ? "the mission is waiting for a downstream event"
                  : "the mission reached a terminal state";
              subscriber.next({ data: JSON.stringify({ type: "end", status: result.status, reason }) });
              break;
            }
            await readable(result.step.kind);
          }
          const final = await runWithTenant(ctx, () => this.missions.view(missionId));
          subscriber.next({ data: JSON.stringify({ type: "mission", mission: final }) });
          subscriber.complete();
        } catch (err) {
          subscriber.next({
            data: JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) }),
          });
          subscriber.complete();
        }
      })();

      return () => { cancelled = true; };
    });
  }

  /**
   * Re-run the last step that failed.
   *
   * The failure is written to the event log and the audit trail BEFORE the step is
   * discarded, and the re-run's own pipeline opens with a `retrying` row carrying the
   * reason the first attempt failed. Every execute step's idempotency key is derived from
   * the mission, the plan version and the vendor — never from the clock — so a retry
   * replays what was already created and raises only what was not.
   */
  @Post("missions/:id/retry")
  @RequirePermission("agentos.run.operate")
  async retry(@Param("id") id: string) {
    return { data: await this.missions.retry(requireUuid(id, "mission")) };
  }

  /**
   * Give a mission its supplier terms from a spreadsheet.
   *
   * Phase 1 holds no price or lead-time master, so these four numbers always come from
   * outside the ERP. This lets them come from the file a factory actually has: .xlsx, .xls
   * or .csv, base64 in an ordinary JSON body so it inherits the same auth, tenant and error
   * pipeline as every other write. The mission re-plans from `sourcing` onward, so the file
   * is genuinely read rather than applied to a plan that was built before it arrived.
   */
  @Post("missions/:id/sources/spreadsheet")
  @RequirePermission("agentos.run.operate")
  async uploadTerms(@Param("id") id: string, @Body() body: unknown) {
    const parsed = z
      .object({
        filename: z.string().min(1).max(200),
        fileBase64: z.string().min(1),
      })
      .safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return {
      data: await this.missions.ingestSupplierTerms(
        requireUuid(id, "mission"),
        parsed.data.filename,
        parsed.data.fileBase64,
      ),
    };
  }

  /** Record a human decision on a waiting approval. */
  @Post("approvals/:id/decide")
  @RequirePermission("agentos.run.operate")
  async decide(@Param("id") id: string, @Body() body: unknown) {
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return { data: await this.missions.decide(requireUuid(id, "approval"), parsed.data.decision, parsed.data.note) };
  }

  /**
   * Move the autonomy dial on a mission.
   *
   * A PATCH on the mission rather than a setting elsewhere, because the envelope belongs to
   * this commitment: a routine restock and a first order from a new customer deserve
   * different answers, and a single global switch cannot express that.
   */
  @Post("missions/:id/autonomy")
  @RequirePermission("agentos.run.operate")
  async setAutonomy(@Param("id") id: string, @Body() body: unknown) {
    const parsed = z.object({ tier: z.enum(["A2", "A3", "A4"]) }).safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return { data: await this.missions.setAutonomy(requireUuid(id, "mission"), parsed.data.tier) };
  }

  /**
   * Start the story again — clear every mission for this tenant.
   *
   * A presenter runs this demo more than once, and without a reset the second run opens on
   * a screen full of finished missions from the first. Refuses outside the demo universe.
   */
  @Post("demo/reset")
  @RequirePermission("agentos.run.operate")
  async reset() {
    return { data: await this.missions.resetDemo() };
  }

  /**
   * Fire the simulated supplier delay.
   *
   * Presenter-triggered rather than on a timer, and that is a correctness decision as much
   * as a stagecraft one: a timer fires whether or not the mission has reached a plan the
   * delay could affect, which makes the demo a video. This asks the mission what it chose
   * and answers honestly — including "this plan does not use that vendor, no impact".
   */
  @Post("missions/:id/simulate/supplier-delay")
  @RequirePermission("agentos.run.operate")
  async disrupt(@Param("id") id: string) {
    return { data: await this.missions.injectDisruption(requireUuid(id, "mission")) };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path segment is whatever the client sent; keep a malformed one away from Postgres. */
function requireUuid(id: string, what: string): string {
  if (!UUID.test(id)) throw Errors.notFound(`${what} '${id}'`);
  return id;
}

/**
 * How long to hold a completed step on screen before starting the next.
 *
 * Weighted by what the step is, not by a constant: an evidence read is a glance, a strategy
 * comparison is three numbers somebody has to actually compare, and the stop for approval
 * should land rather than flick past. These are display timings — the work is already done
 * when the pause begins.
 */
function readable(kind: string): Promise<void> {
  const ms =
    kind === "plan" ? 1_400 :
    kind === "critique" ? 1_100 :
    kind === "authorize" ? 1_200 :
    kind === "act" ? 900 :
    kind === "close" ? 1_000 :
    700;
  return new Promise((r) => setTimeout(r, ms));
}
