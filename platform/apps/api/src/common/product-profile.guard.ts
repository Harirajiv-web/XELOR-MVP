import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { AppError } from "@ind-core/platform";

const COMMON = new Set(["me", "health", "healthz", "readyz", "internal"]);
const ERP = new Set(["general", "engineering", "purchase", "inventory", "stock", "planning", "sales", "production", "quality", "maintenance", "hrm", "accounts", "expenditure", "csp", "portal", "admin", "integration", "dataimport", "workflow"]);
const AI = new Set(["ai", "connectivity", "agent-os", "fulfilment", "aiops", "copilot", "platform-health", "managed-services", "integration", "admin"]);
const NETWORK = new Set(["purchase", "supplier", "general", "engineering", "workflow", "admin", "connectivity"]);

/** Product packaging is a server-side gate in addition to existing RBAC and tenant RLS. */
export function canAccessProductRoute(phase: string, rawPath: string): boolean {
  if (phase === "4") return true;
  const path = rawPath.split("?")[0]!.replace(/^\/api\/v1\/?/, "").replace(/^\//, "");
  const first = path.split("/")[0]!;
  if (COMMON.has(first)) return true;
  if (phase === "1") return ERP.has(first) && !path.startsWith("purchase/network") && !path.startsWith("purchase/tenders");
  if (phase === "2") return AI.has(first);
  if (phase === "3") return NETWORK.has(first);
  return false;
}

@Injectable()
export class ProductProfileGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const phase = process.env.PRODUCT_PHASE ?? "4";
    const req = context.switchToHttp().getRequest<{ originalUrl?: string; url: string }>();
    if (!canAccessProductRoute(phase, req.originalUrl ?? req.url)) {
      throw new AppError("PRODUCT_FEATURE_UNAVAILABLE", 403, "This capability is available in another product phase. Open the integrated workspace to use the full platform.");
    }
    return true;
  }
}
