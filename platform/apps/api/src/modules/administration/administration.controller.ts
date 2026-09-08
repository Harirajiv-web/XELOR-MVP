import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { AccessService } from "./access.service.js";
import { SodService } from "./sod.service.js";
import { ComplianceService } from "./compliance.service.js";
import { PlatformOpsService } from "./platform-ops.service.js";

const UUID = z.string().uuid();
const grantSchema = z.object({ roleCode: z.string().min(1), permission: z.string().min(1) });
const scopeSchema = z.object({
  subject: UUID,
  dimension: z.enum(["company", "branch", "warehouse", "cost_center", "department", "plant"]),
  valueId: z.string().min(1),
  applyToDocType: z.string().optional(),
  justification: z.string().max(500).optional(),
});
const maskSchema = z.object({ subject: UUID, docType: z.string().min(1), rows: z.array(z.record(z.unknown())).max(500) });
const assignSchema = z.object({ subject: UUID, roleCode: z.string().min(1) });
const acceptSchema = z.object({ reason: z.string().min(5) });
const incidentSchema = z.object({
  incidentNo: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.string().min(1),
  detectedAt: z.string().min(10),
  description: z.string().min(1),
  piiAffected: z.boolean().optional(),
  dataPrincipalsEstimate: z.number().int().min(0).optional(),
  certInReportable: z.boolean().optional(),
});
const reportSchema = z.object({ reference: z.string().min(1) });
const refuseSchema = z.object({ statutoryHoldRefs: z.string().min(3) });
const keySchema = z.object({
  label: z.string().min(1),
  scopes: z.array(z.string().min(1)).min(1),
  environment: z.enum(["live", "test"]).optional(),
  rateLimitRpm: z.number().int().min(1).max(10_000).optional(),
  ipAllowlist: z.array(z.string()).optional(),
  expiresAt: z.string().optional(),
});
const checkKeySchema = z.object({ secret: z.string().min(8), scope: z.string().min(1), ip: z.string().optional() });
const revokeSchema = z.object({ reason: z.string().min(3) });
const settingSchema = z.object({ value: z.string().min(1) });
const flagSchema = z.object({ enabled: z.boolean() });
const packSchema = z.object({ fromSeq: z.coerce.number().int().min(0), toSeq: z.coerce.number().int().min(0) });

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}

/**
 * ADMINISTRATION over HTTP — the control plane's console.
 *
 * Nearly everything here is privileged, and the read/write split is deliberate: reading who
 * can do what is how an access review happens, and it must be easy. Changing it is a
 * separate permission, and every change lands in the same hash-chained trail as the
 * business documents it protects.
 */
@Controller("admin")
export class AdministrationController {
  constructor(
    private readonly access: AccessService,
    private readonly sod: SodService,
    private readonly compliance: ComplianceService,
    private readonly ops: PlatformOpsService,
  ) {}

  /* --------------------------------- access ------------------------------- */

  @Get("roles")
  @RequirePermission("admin.access.read")
  async roles() {
    return { data: await this.access.listRoles() };
  }

  @Get("users/:subject/effective-permissions")
  @RequirePermission("admin.access.read")
  async effective(@Param("subject") subject: string) {
    return this.access.effective(subject);
  }

  /** The "Explain access" simulator — the same function the guard uses, uncached. */
  @Get("users/:subject/explain")
  @RequirePermission("admin.access.read")
  async explain(@Param("subject") subject: string, @Query("permission") permission: string, @Query("docType") docType?: string) {
    if (!permission) badRequest([{ path: ["permission"], message: "required" }]);
    return this.access.explain(subject, permission, docType);
  }

  @Get("users/:subject/scope")
  @RequirePermission("admin.access.read")
  async scope(@Param("subject") subject: string, @Query("docType") docType: string) {
    if (!docType) badRequest([{ path: ["docType"], message: "required" }]);
    return this.access.scope(subject, docType);
  }

  /** Show what a given user would actually SEE of a set of rows — scope and masks applied. */
  @Post("access/preview")
  @RequirePermission("admin.access.read")
  async preview(@Body() body: unknown) {
    const p = maskSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.access.filterAndMask(p.data.subject, p.data.docType, p.data.rows);
  }

  @Post("access/grant")
  @RequirePermission("admin.access.write")
  async grant(@Body() body: unknown) {
    const p = grantSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.access.grantPermission(p.data.roleCode, p.data.permission);
  }

  @Post("access/revoke")
  @RequirePermission("admin.access.write")
  async revoke(@Body() body: unknown) {
    const p = grantSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.access.revokePermission(p.data.roleCode, p.data.permission);
  }

  @Post("access/scope")
  @RequirePermission("admin.access.write")
  async addScope(@Body() body: unknown) {
    const p = scopeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.access.addScope(p.data);
  }

  /* ------------------------- segregation of duties ------------------------ */

  @Get("sod/rules")
  @RequirePermission("admin.access.read")
  async sodRules() {
    return { data: await this.sod.listRules() };
  }

  @Post("sod/scan")
  @RequirePermission("admin.access.read")
  async sodScan() {
    return this.sod.scan();
  }

  @Get("sod/findings")
  @RequirePermission("admin.access.read")
  async sodFindings(@Query("status") status?: string) {
    return { data: await this.sod.findings(status ?? "open") };
  }

  /** Check a grant BEFORE making it. */
  @Post("sod/check-grant")
  @RequirePermission("admin.access.read")
  async sodCheck(@Body() body: unknown) {
    const p = assignSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.sod.checkProposedGrant(p.data.subject, p.data.roleCode);
  }

  @Post("sod/assign-role")
  @RequirePermission("admin.access.write")
  async assignRole(@Body() body: unknown) {
    const p = assignSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.sod.assignRole(p.data.subject, p.data.roleCode);
  }

  @Post("sod/findings/:id/accept-risk")
  @RequirePermission("admin.access.write")
  async acceptRisk(@Param("id") id: string, @Body() body: unknown) {
    const p = acceptSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.sod.acceptRisk(id, p.data.reason);
  }

  /** AI #8 — phrase a finding the rules already produced. Off by default. */
  @Post("sod/findings/:id/explain")
  @RequirePermission("admin.access.read")
  async sodExplain(@Param("id") id: string) {
    return this.sod.explainWithAi(id);
  }

  /* ------------------------------ compliance ------------------------------ */

  @Get("incidents")
  @RequirePermission("admin.incident.write")
  async incidents(@Query("asOf") asOf?: string) {
    return { data: await this.compliance.incidents(asOf) };
  }

  @Post("incidents")
  @RequirePermission("admin.incident.write")
  async recordIncident(@Body() body: unknown) {
    const p = incidentSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.compliance.recordIncident(p.data);
  }

  @Post("incidents/:incidentNo/report")
  @RequirePermission("admin.incident.write")
  async reportIncident(@Param("incidentNo") incidentNo: string, @Body() body: unknown) {
    const p = reportSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.compliance.reportIncident(incidentNo, p.data.reference);
  }

  @Get("dsr")
  @RequirePermission("admin.dsr.write")
  async dsr(@Query("asOf") asOf?: string) {
    return { data: await this.compliance.dsrQueue(asOf) };
  }

  @Post("dsr/:requestNo/refuse")
  @RequirePermission("admin.dsr.write")
  async refuseDsr(@Param("requestNo") requestNo: string, @Body() body: unknown) {
    const p = refuseSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.compliance.refuseDsr(requestNo, p.data.statutoryHoldRefs);
  }

  @Get("consent")
  @RequirePermission("admin.dsr.write")
  async consent(@Query("dataPrincipalRef") ref?: string) {
    return { data: await this.compliance.consentLedger(ref) };
  }

  /* ------------------------------- the chain ------------------------------ */

  @Post("audit/verify")
  @RequirePermission("admin.audit.read")
  async verify(@Query("chain") chain?: string) {
    return this.compliance.verifyChain(chain === "ai_action_log" ? "ai_action_log" : "audit_log");
  }

  @Post("audit/anchor")
  @RequirePermission("admin.audit.read")
  async anchor() {
    return this.compliance.anchor();
  }

  @Get("audit/verifications")
  @RequirePermission("admin.audit.read")
  async verifications(@Query("chain") chain?: string) {
    return { data: await this.compliance.verifications(chain) };
  }

  /** The MCA Rule 11(g) auditor pack: a range, its attestation, and the retention posture. */
  @Get("audit/pack")
  @RequirePermission("admin.audit.export")
  async pack(@Query() query: unknown) {
    const p = packSchema.safeParse(query);
    if (!p.success) badRequest(p.error.issues);
    return this.compliance.auditorPack(p.data.fromSeq, p.data.toSeq);
  }

  /* --------------------------- platform operations ------------------------ */

  @Get("api-keys")
  @RequirePermission("admin.apikey.write")
  async keys() {
    return { data: await this.ops.listKeys() };
  }

  @Post("api-keys")
  @RequirePermission("admin.apikey.write")
  async issueKey(@Body() body: unknown) {
    const p = keySchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.issueKey(p.data);
  }

  @Post("api-keys/check")
  @RequirePermission("admin.apikey.write")
  async checkKey(@Body() body: unknown) {
    const p = checkKeySchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.checkKey(p.data.secret, p.data.scope, p.data.ip);
  }

  @Post("api-keys/:prefix/revoke")
  @RequirePermission("admin.apikey.write")
  async revokeKey(@Param("prefix") prefix: string, @Body() body: unknown) {
    const p = revokeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.revokeKey(prefix, p.data.reason);
  }

  @Get("settings")
  @RequirePermission("admin.settings.write")
  async settings() {
    return { data: await this.ops.settings() };
  }

  @Post("settings/:key")
  @RequirePermission("admin.settings.write")
  async setSetting(@Param("key") key: string, @Body() body: unknown) {
    const p = settingSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.setSetting(key, p.data.value);
  }

  @Get("flags")
  @RequirePermission("admin.settings.write")
  async flags() {
    return { data: await this.ops.flags() };
  }

  @Post("flags/:flagKey")
  @RequirePermission("admin.settings.write")
  async setFlag(@Param("flagKey") flagKey: string, @Body() body: unknown) {
    const p = flagSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.ops.setFlag(flagKey, p.data.enabled);
  }

  @Get("licence")
  @RequirePermission("admin.settings.write")
  async licence(@Query("asOf") asOf?: string) {
    return this.ops.licence(asOf);
  }

  @Get("backups")
  @RequirePermission("admin.settings.write")
  async backups() {
    return { data: await this.ops.backups() };
  }

  /** One screen: is the control plane healthy? */
  @Get("posture")
  @RequirePermission("admin.access.read")
  async posture(@Query("asOf") asOf?: string) {
    return this.ops.posture(asOf);
  }
}
