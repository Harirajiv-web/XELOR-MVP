import { Injectable } from "@nestjs/common";
import type { BiometricDevice, DevicePunch } from "../../ports/biometric.port.js";

/**
 * The demo-mode adapter behind `BiometricDevicePort` (HR-20, §11.1).
 *
 * It is a **deterministic simulator**, not a random one. The same schedule always yields
 * the same punches, so the demo month is reproducible and the golden payslips it feeds are
 * stable. It also deliberately emits the mess a real device emits — a duplicated read, a
 * missing out-punch, a late arrival, direction-less punches — because an attendance engine
 * that has only ever seen clean data is not evidence of anything.
 */
export interface ScheduledDay {
  empCode: string;
  attDate: string; // YYYY-MM-DD
  /** "HH:MM" local wall-clock of the rostered shift. */
  shiftStart: string;
  shiftEnd: string;
  isNight: boolean;
  /** From the shift master, so an overtime day can be simulated to the exact hour. */
  breakMinutes: number;
  otAfterMinutes: number;
  scenario: DayScenario;
}

export type DayScenario =
  | { kind: "normal" }
  | { kind: "overtime"; hours: number }
  | { kind: "late"; minutes: number }
  | { kind: "missing_out" }
  | { kind: "duplicate_in" }
  | { kind: "no_show" }
  | { kind: "directionless" };

const OFFSET = "+05:30"; // the tenant's wall-clock; the device reports local time

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stamp(dateISO: string, hhmm: string, plusMinutes = 0): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h! * 60 + m! + plusMinutes;
  const day = addDaysISO(dateISO, Math.floor(total / 1440));
  const mins = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  return `${day}T${hh}:${mm}:00${OFFSET}`;
}

@Injectable()
export class FakeBiometricDevice implements BiometricDevice {
  readonly adapterName = "fake-device-feed";
  private schedule: ScheduledDay[] = [];

  /** Demo-only. The real adapter has no equivalent — it just polls the bridge. */
  load(schedule: ScheduledDay[]): void {
    this.schedule = schedule;
  }

  async poll(fromIso: string, toIso: string): Promise<DevicePunch[]> {
    const from = fromIso.slice(0, 10);
    const to = toIso.slice(0, 10);
    const out: DevicePunch[] = [];

    for (const d of this.schedule) {
      if (d.attDate < from || d.attDate > to) continue;
      const deviceId = d.isNight ? "PUNE-GATE-02" : "PUNE-GATE-01";
      const push = (punchTime: string, direction: DevicePunch["direction"]): void => {
        out.push({ deviceId, empCode: d.empCode, punchTime, direction, source: "device" });
      };
      // A night shift's end is on the FOLLOWING calendar day; `stamp` rolls the date over
      // on its own, which is exactly the case the engine has to attribute back.
      const endAt = (extra: number): string =>
        stamp(d.attDate, d.shiftEnd, (d.isNight ? 1440 : 0) + extra);

      switch (d.scenario.kind) {
        case "normal":
          push(stamp(d.attDate, d.shiftStart, -3), "in");
          push(endAt(6), "out");
          break;
        case "overtime":
          // Simulated back from the POLICY, so the engine's OT figure lands on the exact
          // hour asked for: worked = break + ot_after + requested, and OT is the excess.
          push(stamp(d.attDate, d.shiftStart, 0), "in");
          push(
            stamp(d.attDate, d.shiftStart, d.breakMinutes + d.otAfterMinutes + Math.round(d.scenario.hours * 60)),
            "out",
          );
          break;
        case "late":
          push(stamp(d.attDate, d.shiftStart, d.scenario.minutes), "in");
          push(endAt(6), "out");
          break;
        case "missing_out":
          // The worker walked out of the side gate. The engine must NOT guess a full day.
          push(stamp(d.attDate, d.shiftStart, -3), "in");
          break;
        case "duplicate_in":
          push(stamp(d.attDate, d.shiftStart, -3), "in");
          push(stamp(d.attDate, d.shiftStart, -3), "in"); // same second, twice
          push(endAt(6), "out");
          break;
        case "no_show":
          break;
        case "directionless":
          // A cheap turnstile that reports no direction at all.
          push(stamp(d.attDate, d.shiftStart, -3), "auto");
          push(endAt(6), "auto");
          break;
      }
    }
    return out;
  }
}
