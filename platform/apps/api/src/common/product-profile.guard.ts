import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { AppError } from "@ind-core/platform";

const COMMON = new Set(["me", "health", "healthz", "readyz", "internal"]);
const ERP = new Set(["general", "engineering", "purchase", "inventory", "stock", "planning", "sales", "production", "quality", "maintenance", "hrm", "accounts", "expenditure", "csp", "portal", "admin", "integration", "dataimport", "workflow"]);
const AI = new Set(["ai", "connectivity", "agent-os", "fulfilment", "aiops", "copilot", "platform-health", "managed-services", "integration", "admin"]);
const NETWORK = new Set(["purchase", "supplier", "general", "engineering", "workflow", "admin", "connectivity"]);

// The six connected packages (profiles 5-10). Each one reaches the ERP data it
// extends and nothing else: a package cannot read a neighbour's records just
// because both are add-ons. Note these are API path prefixes, which are not
// always spelled like the web module key ("administration" is served at "admin",
// "engchange" rides the existing engineering/planning routes), so this set is
// maintained by hand against the route table rather than derived from the
// profile's module list.
const PLANT = new Set(["plantops", "maintenance", "production", "stock", "inventory", "general", "engineering", "workflow", "admin", "integration"]);
const COMPLIANCE = new Set(["safety", "quality", "production", "purchase", "stock", "inventory", "general", "workflow", "admin"]);
const WAREHOUSE = new Set(["warehouse", "inventory", "stock", "purchase", "sales", "production", "quality", "general", "workflow", "admin"]);
const ENGCHANGE = new Set(["engchange", "planning", "engineering", "production", "inventory", "stock", "sales", "general", "workflow", "admin"]);
const REVENUE = new Set(["costing", "quotation", "sales", "csp", "portal", "general", "engineering", "inventory", "stock", "accounts", "workflow", "admin"]);
const DELIVERY = new Set(["delivery", "integration", "dataimport", "platform-health", "managed-services", "connectivity", "general", "workflow", "admin"]);

const PACKAGE_ROUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  "5": PLANT,
  "6": COMPLIANCE,
  "7": WAREHOUSE,
  "8": ENGCHANGE,
  "9": REVENUE,
  "10": DELIVERY,
};

/** Product packaging is a server-side gate in addition to existing RBAC and tenant RLS. */
export function canAccessProductRoute(phase: string, rawPath: string): boolean {
  if (phase === "4") return true;
  const path = rawPath.split("?")[0]!.replace(/^\/api\/v1\/?/, "").replace(/^\//, "");
  const first = path.split("/")[0]!;
  if (COMMON.has(first)) return true;
  if (phase === "1") return ERP.has(first) && !path.startsWith("purchase/network") && !path.startsWith("purchase/tenders");
  if (phase === "2") return AI.has(first);
  if (phase === "3") return NETWORK.has(first);
  const packageRoutes = PACKAGE_ROUTES[phase];
  // A package never gets the supplier-network endpoints; those belong to AIKYANTRA.
  if (packageRoutes) return packageRoutes.has(first) && !path.startsWith("purchase/network") && !path.startsWith("purchase/tenders");
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
