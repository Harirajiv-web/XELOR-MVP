import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors, IMPORT_TARGET_KEYS, type ImportTargetKey } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { DataImportService } from "./dataimport.service.js";
import type { ForwardedCredentials } from "./domain-client.js";

/**
 * The permitted targets come from the platform registry, so adding one there adds it here.
 * The cast is only zod's non-empty-tuple requirement meeting a readonly array — the element
 * type is preserved, which is what keeps the parsed value a `ImportTargetKey` rather than a
 * bare string the service would have to re-check.
 */
const targetEnum = z.enum(
  IMPORT_TARGET_KEYS as unknown as [ImportTargetKey, ...ImportTargetKey[]],
);

/**
 * The file itself. Base64 in a JSON body — see `workbook.ts` for why, and for the size
 * ceiling that choice implies. Bounded here as well as there so an oversized string is
 * refused before it is decoded rather than after.
 */
const fileSchema = {
  fileBase64: z.string().min(1).max(2_000_000),
  filename: z.string().min(1).max(260),
};

const inspectSchema = z.object({
  ...fileSchema,
  sheet: z.string().min(1).max(200).optional(),
  target: targetEnum.optional(),
});

/**
 * `mapping` is field -> column header. Keys are checked against the target's field list by
 * the service; an unknown key is dropped rather than 400-ing, because a wizard that sends a
 * stale field name after a spec change should degrade to "that field was not imported"
 * rather than to a failed upload.
 */
const mappingSchema = z.record(z.string().min(1), z.string());

const validateSchema = z.object({
  ...fileSchema,
  sheet: z.string().min(1).max(200),
  target: targetEnum,
  mapping: mappingSchema,
});

const commitSchema = validateSchema.extend({
  /**
   * What to do with a row the duplicate brain flags. Defaults to `skip` — an import is the
   * last place that should be able to talk past a warning a person would have had to answer.
   */
  onDuplicate: z.enum(["skip", "import_anyway"]).default("skip"),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}
function requireKey(key?: string): string {
  if (!key) {
    throw Errors.validation([
      { field: "Idempotency-Key", message: "header is required on mutations" },
    ]);
  }
  return key;
}

/**
 * SPREADSHEET IMPORT over HTTP.
 *
 * Three steps, in the order a person actually works: look at the file, check what it would
 * do, then do it. Nothing before `commit` writes anything, which is what makes the wizard
 * safe to explore — an operator can upload the wrong file, map the wrong column and see the
 * consequences without having caused any.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ROUTES CARRY *INTEGRATION* PERMISSIONS, AND WHY THAT IS NOT A SHORTCUT
 * ---------------------------------------------------------------------------
 * A spreadsheet is how most of these factories already integrate: it is the file the
 * production planner emails on Monday and the stock count somebody typed on Saturday. So an
 * import belongs to INTEGRATION alongside the other inbound routes, and it uses that
 * module's existing pair — `integration.flow.read` to look at a file and its mapping,
 * `integration.flow.manage` to run one — rather than minting a permission for itself.
 *
 * THE IMPORTANT PART: neither of those grants the right to create anything. Every row is
 * committed by calling the entity's own endpoint with the CALLER's credentials, so
 * `sales.customer.create` is still checked, by the same guard, for every customer this
 * creates. Someone holding only the integration permissions can inspect and validate all day
 * and will receive a 403 per row on commit. A spreadsheet is not a way around the RBAC wall,
 * and the reason it is not is structural rather than a rule somebody has to remember.
 */
@Controller("dataimport")
export class DataImportController {
  constructor(private readonly imports: DataImportService) {}

  /**
   * The fields each target accepts, served rather than duplicated in the browser bundle.
   * The wizard's mapping controls are drawn from this, so the list a user maps against and
   * the list the server validates against cannot drift apart.
   */
  @Get("targets")
  @RequirePermission("integration.flow.read")
  targets() {
    return this.imports.targets();
  }

  /**
   * What is in this file? Sheets, their headers, a sample of real rows, and — when a target
   * is named — a suggested column mapping to start from.
   *
   * A POST that changes nothing. It is a POST because the file is in the body; there is no
   * `Idempotency-Key` on it because there is nothing to make idempotent, and requiring one
   * would teach clients that the header is decoration.
   */
  @Post("inspect")
  // 200, not Nest's default 201 for a POST. Nothing was created; saying otherwise to a
  // client that reads status codes is a small lie with a long tail.
  @HttpCode(200)
  @RequirePermission("integration.flow.read")
  async inspect(@Body() body: unknown) {
    const p = inspectSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.imports.inspect(p.data);
  }

  /**
   * What WOULD happen, row by row, with this mapping — including the checks only live data
   * can make, such as whether the part numbers in the file exist.
   *
   * Also a POST that changes nothing.
   */
  @Post("validate")
  @HttpCode(200)
  @RequirePermission("integration.flow.read")
  async validate(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("x-xelor-public-demo") publicDemo?: string,
    @Headers("x-xelor-demo-persona") demoPersona?: string,
  ) {
    const p = validateSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.imports.validate(p.data, creds(authorization, publicDemo, demoPersona));
  }

  /**
   * Import the accepted rows.
   *
   * Idempotent twice over, at two different scales, because they protect against different
   * accidents. The `Idempotency-Key` header is required by §5.3 and identifies this request;
   * the BATCH is identified by the content of the file, its sheet, its target and its
   * mapping, so a re-post of the same import resumes it and skips what already landed
   * instead of creating everything a second time. The second guarantee is the one that
   * matters after a dropped connection, and it is the reason this route deliberately does
   * not sit inside the platform's replay ledger — see the service.
   */
  @Post("commit")
  // 200 rather than 201 even here: this answers with a BATCH SUMMARY, and a re-post that
  // resumes or replays an existing batch creates nothing at all.
  @HttpCode(200)
  @RequirePermission("integration.flow.manage")
  async commit(
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-xelor-public-demo") publicDemo?: string,
    @Headers("x-xelor-demo-persona") demoPersona?: string,
  ) {
    requireKey(key);
    const p = commitSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.imports.commit(p.data, creds(authorization, publicDemo, demoPersona));
  }

  /** Every import ever run in this tenant, newest first. */
  @Get("batches")
  @RequirePermission("integration.flow.read")
  async batches(@Query() query: unknown) {
    const p = listQuerySchema.safeParse(query);
    if (!p.success) badRequest(p.error.issues);
    return this.imports.listBatches(p.data.limit, p.data.cursor);
  }

  /**
   * One import, with every row and what became of it — including the rejected ones.
   *
   * The rejected rows are the point. "Why is this part missing from the master" is answered
   * here, by the row that named it and the reason it was refused, months later.
   */
  @Get("batches/:id")
  @RequirePermission("integration.flow.read")
  async batch(@Param("id") id: string) {
    return this.imports.batchDetail(id);
  }
}

/**
 * The caller's own credentials, carried to the domain endpoints this import posts to.
 *
 * Forwarded rather than substituted: the row must be created by the person who uploaded the
 * file, under their permissions, in their audit trail. An import that wrote under a service
 * identity would be a way to create records nobody is accountable for.
 */
function creds(
  authorization?: string,
  publicDemo?: string,
  demoPersona?: string,
): ForwardedCredentials {
  return { authorization, publicDemo, demoPersona };
}
