"use client";

import { useEffect, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { cn } from "../ui/cn";
import { useTheme, type ThemeChoice } from "./theme";

/**
 * Three choices, not two.
 *
 * A plain on/off switch cannot express "follow the machine", and follow-the-machine is the
 * right answer for most people — their laptop already switches at sunset and their ERP
 * should not be the one application that argues with it. Offering only light and dark
 * forces everybody to make a decision they had already made somewhere else.
 *
 * The button shows what is CURRENTLY IN EFFECT, so a person on "system" at night sees a
 * moon. The menu shows what was CHOSEN, so they can still see they picked "system" and did
 * not pick dark. Those are different facts and conflating them is how a settings control
 * starts to feel like it is not listening.
 */
const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; icon: string; hint: string }> = [
  { value: "light", label: "Light", icon: "Sun", hint: "For a bright plant office" },
  { value: "dark", label: "Dark", icon: "Moon", hint: "For a night shift" },
  { value: "system", label: "Match my device", icon: "MonitorCog", hint: "Follows your machine" },
];

export function ThemeToggle(): React.JSX.Element {
  const { choice, resolved, setChoice } = useTheme();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Current = resolved === "dark" ? Icons.Moon : Icons.Sun;

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Appearance — currently ${resolved}${choice === "system" ? ", matching your device" : ""}`}
        title="Appearance"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-[9px] transition-colors",
          open
            ? "bg-[var(--brand-soft)] text-[var(--brand)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg)]",
        )}
      >
        <Current className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[228px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] py-1 shadow-[var(--shadow-lg)]"
        >
          {OPTIONS.map((o) => {
            const OptIcon =
              (Icons as unknown as Record<string, Icons.LucideIcon>)[o.icon] ?? Icons.Circle;
            const active = choice === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setChoice(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  active ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--bg)]",
                )}
              >
                <OptIcon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-[var(--brand)]" : "text-[var(--text-muted)]",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[12.5px] font-semibold",
                      active ? "text-[var(--brand)]" : "text-[var(--text-primary)]",
                    )}
                  >
                    {o.label}
                  </span>
                  <span className="block truncate text-[10.5px] text-[var(--text-muted)]">
                    {o.hint}
                  </span>
                </span>
                {active ? (
                  <Icons.Check className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
