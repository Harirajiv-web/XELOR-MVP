import { api } from "../api/client";

/**
 * HOW LONG IS A MISSION? ASK THE SERVER, NOT THE SOURCE CODE.
 *
 * Three files used to answer "step 4 of what?" with the literal `13`: Mission Control, the
 * agent bar (three separate times) and the stage panel. The arc is thirteen steps TODAY,
 * and the number lives in `ARC` in `mission.service.ts`, which is the only place entitled to
 * know it. The moment somebody adds a step — or a rejected plan sends a mission back through
 * the authority gate and it runs to fifteen — every one of those literals becomes a
 * confident lie on the most trust-sensitive screen in the product. "Step 15 of 13" is the
 * good outcome; the bad one is a progress bar that sits at 100% for three more steps and
 * quietly teaches somebody that the machine does not know what it is doing.
 *
 * So the total comes from `GET /fulfilment/meta` when that endpoint carries it, and from the
 * mission itself when it does not, and IT IS ALLOWED TO BE UNKNOWN. `stepCounter` renders
 * "Step 4" rather than inventing a denominator — a missing fact stated plainly beats a
 * plausible one that is wrong. Progress in the meantime is drawn from the six chapters,
 * which the server has always served.
 *
 * The meta call is cached at module scope for the life of the tab: four screens ask for it,
 * the answer cannot change inside a session, and one request is enough.
 */

/** One of the six acts, exactly as `GET /fulfilment/meta` serves them. */
export interface Chapter {
  key: string;
  name: string;
  lands: string;
}

export interface MissionMeta {
  chapters: readonly Chapter[];
  /**
   * How many steps a complete mission runs to, when the server says so — it may serve
   * `totalSteps`, or the arc itself. Null when it serves neither, which is not an error and
   * must not be rendered as one.
   */
  totalSteps: number | null;
}

const EMPTY: MissionMeta = { chapters: [], totalSteps: null };

let cache: MissionMeta | null = null;
let inFlight: Promise<MissionMeta> | null = null;

export async function loadMissionMeta(): Promise<MissionMeta> {
  if (cache) return cache;
  inFlight ??= api
    .get<{ data: unknown }>("/fulfilment/meta")
    .then((r) => {
      cache = parseMeta(r.data);
      return cache;
    })
    .catch(() => {
      // A reader without `agentos.run.read` gets a 403 here, and a build where the endpoint
      // has moved gets a 404. Neither is worth a red box: it costs the chapter names and the
      // denominator, and every caller is written to do without both. Cleared rather than
      // cached so a later screen gets another go.
      inFlight = null;
      return EMPTY;
    });
  return inFlight;
}

/** Exported for the tests: the parsing rules, with no network anywhere near them. */
export function parseMeta(data: unknown): MissionMeta {
  const d = (data ?? {}) as { chapters?: unknown; totalSteps?: unknown; arc?: unknown };
  const chapters = Array.isArray(d.chapters)
    ? d.chapters.filter(
        (c): c is Chapter =>
          !!c && typeof c === "object" && typeof (c as Chapter).key === "string",
      )
    : [];
  const totalSteps =
    typeof d.totalSteps === "number" && d.totalSteps > 0
      ? d.totalSteps
      : Array.isArray(d.arc) && d.arc.length > 0
        ? d.arc.length
        : null;
  return { chapters, totalSteps };
}

/**
 * The denominator, once the mission itself has been seen.
 *
 * A mission that was replanned runs past the arc's nominal length, and the highest step it
 * has actually reached is a fact rather than a projection — so the larger of the two wins.
 * That is the one direction this may be adjusted in: never shortened, because a step that
 * exists cannot be outside the total.
 */
export function arcTotal(
  metaTotal: number | null,
  steps: readonly { seq: number }[],
): number | null {
  const highest = steps.reduce((max, s) => (s.seq > max ? s.seq : max), 0);
  const total = Math.max(metaTotal ?? 0, highest);
  return total > 0 ? total : null;
}

/** "Step 4 of 13" when the total is known, "Step 4" when it honestly is not. */
export function stepCounter(seq: number, total: number | null): string {
  return total && total >= seq ? `Step ${seq} of ${total}` : `Step ${seq}`;
}
