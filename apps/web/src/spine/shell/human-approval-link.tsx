"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, UserRoundCheck } from "lucide-react";
import { api } from "../api/client";
import { useAccess } from "../access/permissions";
import { cn } from "../ui/cn";

interface ApprovalRow {
  id: string;
  status: string;
}

interface ApprovalEnvelope {
  data: readonly ApprovalRow[];
}

/**
 * Human authority must be visible from every workspace, not discoverable only after a
 * person opens the right mission. The server remains the source of truth; this count is a
 * tenant-scoped read of the same pending approvals rendered by the dedicated inbox.
 */
export function HumanApprovalLink(): React.JSX.Element | null {
  const pathname = usePathname();
  const { can, ready } = useAccess();
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await api.get<ApprovalEnvelope>("/agent-os/approvals");
      setCount(result.data.filter((item) => item.status === "pending").length);
    } catch {
      // The navigation remains available even if the decorative count cannot load. The
      // inbox itself will show the actionable error and retry control.
      setCount(null);
    }
  }, []);

  useEffect(() => {
    if (!ready || !can("agentos.approval.decide")) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onFocus = (): void => void refresh();
    const onApprovalChange = (): void => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("xelor:approvals-changed", onApprovalChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("xelor:approvals-changed", onApprovalChange);
    };
  }, [can, ready, refresh]);

  if (!ready || !can("agentos.approval.decide")) return null;

  const active = pathname === "/agentos/approvals";
  const waiting = (count ?? 0) > 0;

  return (
    <Link
      href="/agentos/approvals"
      aria-label={
        count === null
          ? "Open human approvals"
          : `${count} human approval${count === 1 ? "" : "s"} waiting`
      }
      title="Human approvals"
      className={cn(
        "group relative inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] border px-2.5 text-[11.5px] font-bold transition-colors",
        active
          ? "border-[var(--violet)] bg-[var(--violet-soft)] text-[var(--ai-text)]"
          : waiting
            ? "border-[color-mix(in_srgb,var(--warn)_38%,var(--border-subtle))] bg-[var(--warn-soft)] text-[var(--warn-ink)] hover:border-[var(--warn)]"
            : "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text-primary)]",
      )}
    >
      {waiting ? (
        <UserRoundCheck className="h-4 w-4" aria-hidden />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-[var(--ok-ink)]" aria-hidden />
      )}
      <span className="hidden lg:inline">Approvals</span>
      <span
        className={cn(
          "grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-extrabold",
          waiting
            ? "bg-[var(--warn)] text-[var(--text-on-accent)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-muted)]",
        )}
        aria-hidden
      >
        {count ?? "·"}
      </span>
      {waiting ? (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--warn)]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--warn)] opacity-60" />
        </span>
      ) : null}
    </Link>
  );
}
