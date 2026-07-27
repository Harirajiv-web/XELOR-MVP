import type { StatusTone } from "@spine/ui/status-badge";
import type { TicketSla } from "./api";

/**
 * READING THE SLA CLOCK.
 *
 * The verdict itself is the engine's — nothing here decides whether a ticket is breached,
 * because a promise the customer can dispute has to be reconstructible from stored rows.
 * These two functions only turn that verdict into something a person can read at a glance.
 *
 * The tone matters more than it looks. A breached SLA gets `overdue`, which is the only
 * tone drawn as a TRIANGLE — every other red state in this product is a circle. An agent
 * with deuteranopia scanning forty rows finds the late ones by shape, not by hue, and that
 * is the whole reason the eight-tone language exists.
 *
 * `relativeDays` is not used here on purpose: it rounds to whole days, and an SLA measured
 * in business minutes would report "today" for a ticket with eleven minutes left on it.
 */
export function slaTone(state: string): StatusTone {
  switch (state) {
    case "breached_response":
    case "breached_resolution":
      return "overdue";
    case "at_risk":
      return "pending";
    case "on_track":
      return "approved";
    case "met":
      return "done";
    case "paused":
      return "hold";
    default:
      return "unknown";
  }
}

/**
 * The second line under the chip: how long is left, or how far past the promise it is.
 *
 * Returns null where a countdown would be meaningless — a met clock has nothing left to
 * run, and an untriaged ticket has no policy and therefore no promise to count against.
 */
export function slaClockNote(sla: TicketSla, now: number = Date.now()): string | null {
  switch (sla.state) {
    case "paused":
      return "Clock stopped — waiting on the customer";
    case "met":
      return null;
    case "breached_response":
      return sla.firstResponseDue
        ? `${elapsed(sla.firstResponseDue, now)} past the response promise`
        : "Response promise missed";
    case "breached_resolution":
      return sla.resolutionDue
        ? `${elapsed(sla.resolutionDue, now)} past the resolution promise`
        : "Resolution promise missed";
    default: {
      // Whichever promise falls first is the one an agent is actually working against.
      const next = nextDue(sla, now);
      return next ? `${elapsed(next.at, now)} left to ${next.what}` : null;
    }
  }
}

function nextDue(sla: TicketSla, now: number): { at: string; what: string } | null {
  const candidates: Array<{ at: string; what: string }> = [];
  if (sla.firstResponseDue && new Date(sla.firstResponseDue).getTime() > now) {
    candidates.push({ at: sla.firstResponseDue, what: "first response" });
  }
  if (sla.resolutionDue && new Date(sla.resolutionDue).getTime() > now) {
    candidates.push({ at: sla.resolutionDue, what: "resolve" });
  }
  candidates.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return candidates[0] ?? null;
}

/** "3 h 12 m", "2 d 4 h", "under a minute" — the distance between an instant and now. */
function elapsed(iso: string, now: number): string {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "—";
  const mins = Math.round(Math.abs(target - now) / 60_000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`;
}
