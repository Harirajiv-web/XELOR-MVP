import { z } from "zod";
import { AppError, Errors } from "@ind-core/platform";

/** Presentation only: these values never grant permissions or alter accounting rules. */
export const WORKSPACE_CONFIG_KEY = "xelor.workspace.presentation.v1";
export const WORKSPACE_INDUSTRIES = ["general", "precision", "machinery", "assembly", "distribution"] as const;
export const WORKSPACE_DEPARTMENTS = ["sales", "purchasing", "inventory", "operations", "finance", "people"] as const;
export const WORKSPACE_QUICK_ACTIONS = [
  "quotes", "sales-orders", "customers", "purchase-orders", "suppliers", "stock", "warehouses", "items",
  "mrp", "planned-orders", "planning-exceptions", "demand", "policies", "work-orders", "inspections",
  "ledger", "vouchers", "expenses", "employees", "attendance", "leave", "companies", "roles", "audit", "import",
] as const;

// Single-line plain labels. Rendering still escapes text; this is not an HTML field.
const plainLabel = (max: number) => z.string().trim().max(max)
  .regex(/^[^<>\u0000-\u001f\u007f-\u009f]*$/u, "Use a single-line plain-text label");
const terminologyLabel = plainLabel(32).refine((value) => value.length > 0, "Label cannot be empty");
const unique = (values: readonly string[]) => new Set(values).size === values.length;

export const workspaceConfigSchema = z.object({
  schemaVersion: z.literal(1),
  industryPreset: z.enum(WORKSPACE_INDUSTRIES),
  businessLabel: plainLabel(80),
  terminology: z.object({
    customer: terminologyLabel,
    supplier: terminologyLabel,
    item: terminologyLabel,
    workOrder: terminologyLabel,
  }).strict(),
  visibleDepartments: z.array(z.enum(WORKSPACE_DEPARTMENTS)).max(WORKSPACE_DEPARTMENTS.length)
    .refine(unique, "Departments must be unique"),
  quickActionOrder: z.array(z.enum(WORKSPACE_QUICK_ACTIONS)).max(8)
    .refine(unique, "Quick actions must be unique").default([]),
}).strict();

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export interface WorkspaceConfigResponse {
  config: WorkspaceConfig;
  updatedAt: string | null;
}

export function defaultWorkspaceConfig(): WorkspaceConfig {
  return {
    schemaVersion: 1,
    industryPreset: "general",
    businessLabel: "",
    terminology: { customer: "Customers", supplier: "Suppliers", item: "Items", workOrder: "Work orders" },
    visibleDepartments: [...WORKSPACE_DEPARTMENTS],
    quickActionOrder: [],
  };
}

export function parseWorkspaceConfig(input: unknown): WorkspaceConfig {
  const parsed = workspaceConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw Errors.validation(parsed.error.issues.map((issue) => ({
      field: issue.path.join("."), message: issue.message,
    })));
  }
  return parsed.data;
}

/** Missing data gets defaults; invalid existing data must not masquerade as a fresh workspace. */
export function workspaceConfigResponse(row?: {
  valueType: string; value: string; isSecret: boolean; updatedAt: Date;
}): WorkspaceConfigResponse {
  if (!row) return { config: defaultWorkspaceConfig(), updatedAt: null };
  let value: unknown;
  try { value = JSON.parse(row.value); } catch { value = undefined; }
  const parsed = workspaceConfigSchema.safeParse(value);
  if (row.valueType !== "json" || row.isSecret || !parsed.success) {
    throw new AppError("WORKSPACE_CONFIG_INVALID", 409,
      "The saved workspace configuration is invalid. An administrator can replace it from Workspace settings.");
  }
  return { config: parsed.data, updatedAt: row.updatedAt.toISOString() };
}

export function requireWorkspaceIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > 200 || /[\u0000-\u001f\u007f]/u.test(key)) {
    throw Errors.validation([{ field: "Idempotency-Key", message: "A non-empty header of at most 200 characters is required" }]);
  }
  return key;
}

/** Keep the old arbitrary-setting endpoint from bypassing this setting's strict schema. */
export function assertGenericSettingWritable(key: string): void {
  if (key === WORKSPACE_CONFIG_KEY) {
    throw Errors.validation([{ field: "key", message: "Use the workspace configuration endpoint to change this setting" }]);
  }
}
