import { ArrowRight, Building2 } from "lucide-react";
import { departmentForModule } from "../registry/departments";
import { cn } from "./cn";
import { plainDepartmentName } from "./plain-language";

/**
 * The visible hand-off behind a Copilot answer.
 *
 * Phase 1 Copilot is read-only, so this deliberately says "routed to" rather than
 * "changed" or "executed". The highlighted department and module come from the same
 * registered intent/module ownership chain used by the application navigation.
 */
export function CopilotDepartmentRoute({
  moduleKey,
  compact = false,
}: {
  moduleKey: string | null | undefined;
  compact?: boolean;
}): React.JSX.Element | null {
  const route = departmentForModule(moduleKey);
  if (!route) return null;

  const departmentName = plainDepartmentName(
    route.department.code,
    route.department.name,
  );

  return (
    <div
      data-testid="copilot-department-route"
      data-module={route.module.key}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-control)] border bg-[var(--surface-raised)]",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
      )}
      style={{ borderLeftColor: route.department.accent, borderLeftWidth: 4 }}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-[9px] text-[var(--text-on-brand)]",
          compact ? "h-7 w-7" : "h-8 w-8",
        )}
        style={{ background: route.department.accent }}
      >
        <Building2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Agent in play
        </span>
        <span
          className={cn(
            "block font-bold text-[var(--text-primary)]",
            compact ? "text-[11px]" : "text-[13px]",
          )}
        >
          {route.department.code} · {departmentName}
        </span>
      </span>
      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
      <span
        className={cn(
          "shrink-0 font-semibold text-[var(--brand)]",
          compact ? "text-[10px]" : "text-[12px]",
        )}
      >
        {route.module.name}
      </span>
    </div>
  );
}
