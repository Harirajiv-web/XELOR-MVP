import { Injectable } from "@nestjs/common";
import { and, desc, eq, lte, gte } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { currentTenant } from "@ind-core/platform";

const { userRole, rolePermission, role, licenceRecord, company } = schema;

export interface MeView {
  subject: string;
  tenantId: string;
  principal: string;
  customerAccountId: string | null;
  roles: { code: string; name: string }[];
  permissions: string[];
  licence: {
    plan: string;
    modules: string[];
    validFrom: string;
    validTo: string;
    enforcement: string;
    expired: boolean;
  } | null;
  organisation: { name: string } | null;
}

/**
 * WHO AM I, AND WHAT MAY I DO.
 *
 * Every front end needs this before it can draw anything, and without it each one invents
 * its own answer. The web app's first attempt inferred permissions from the copilot's
 * capability list — which describes what may be ASKED, a strict subset of what may be
 * DONE — so every screen with no copilot question behind it would have been silently
 * hidden from the person who owns it.
 *
 * IT REQUIRES NO PERMISSION. Not an oversight: a person is always entitled to know their
 * own access, and gating "what am I allowed to do" behind a permission produces the
 * situation where somebody cannot find out why they cannot do anything. It reveals nothing
 * they could not discover by clicking every menu and noting which ones refused them.
 *
 * It returns the LICENCE too, because "this company did not buy Maintenance" and "you
 * personally may not open Maintenance" are different facts that a menu has to tell apart —
 * one is answered by an administrator, the other by a salesperson.
 */
@Injectable()
export class MeService {
  async describe(): Promise<MeView> {
    const { tenantId, actorId, principal, customerAccountId } = currentTenant();

    return withTenant(async (tx) => {
      const grants = await tx
        .select({ code: role.code, name: role.name, permission: rolePermission.permission })
        .from(userRole)
        .innerJoin(role, eq(role.id, userRole.roleId))
        .leftJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
        .where(eq(userRole.subject, actorId));

      const roleMap = new Map<string, string>();
      const permissions = new Set<string>();
      for (const g of grants) {
        roleMap.set(g.code, g.name);
        if (g.permission) permissions.add(g.permission);
      }

      const today = new Date().toISOString().slice(0, 10);
      const [lic] = await tx
        .select()
        .from(licenceRecord)
        .orderBy(desc(licenceRecord.validTo))
        .limit(1);

      // `legalName`, not `name` — the column is `legal_name`, because what goes on a GST
      // invoice is the registered legal name and not a trading style.
      const [org] = await tx.select({ name: company.legalName }).from(company).limit(1);

      return {
        subject: actorId,
        tenantId,
        principal: principal ?? "staff",
        customerAccountId: customerAccountId ?? null,
        roles: [...roleMap].map(([code, name]) => ({ code, name })),
        permissions: [...permissions].sort(),
        licence: lic
          ? {
              plan: lic.plan,
              modules: Array.isArray(lic.modules) ? (lic.modules as string[]) : [],
              validFrom: String(lic.validFrom),
              validTo: String(lic.validTo),
              enforcement: lic.enforcement,
              // Reported, never enforced here. Enforcement is soft by decision: a plant
              // does not stop because a licence lapsed on a Friday evening. The console
              // says so, loudly, and the work continues.
              expired: String(lic.validTo) < today,
            }
          : null,
        organisation: org ? { name: org.name } : null,
      };
    });
  }
}
