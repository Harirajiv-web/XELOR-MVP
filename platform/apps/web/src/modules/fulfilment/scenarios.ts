/**
 * THE NINE THINGS A MISSION CAN BE SHOWN DOING.
 *
 * A demo that can only ever run the happy path proves one thing: that the happy path was
 * built. The interesting question in front of a factory owner is what happens when the
 * casting is late, when the only fast supplier is dearer than the margin allows, when the
 * work centre is already full, when a person says no. Each of those is a scenario, and the
 * mission service is the only thing that knows which of them it can actually stage against
 * THIS tenant's records today.
 *
 * So the list is FETCHED, never written down here. `GET /fulfilment/scenarios` probes the
 * tenant's own orders and answers per scenario "yes — run it on SO-2627-00004" or "no, and
 * here is exactly what is missing". Both answers are worth showing: `available: false` is
 * rendered as an unavailable card with its reason, not hidden, because somebody is being
 * shown what this product does and "not against your data, and here is why" is a truthful
 * and useful answer where a silently absent card is not.
 *
 * There is no fallback list on purpose. If the endpoint is not there, the picker does not
 * appear and Mission Control works exactly as it did before. Inventing nine plausible
 * scenario names in the web app would put words on screen that no engine can honour, which
 * is the one failure this whole layer exists to avoid.
 *
 * Every field is parsed defensively but the shape is not guessed at — it is
 * `ResolvedScenario` in `apps/api/src/fulfilment/scenarios.ts`. The tolerance exists because
 * these two files are being written at the same time by two hands, not because the contract
 * is vague.
 */

import { api } from "@spine/api/client";

export interface Scenario {
  key: string;
  /** 1..9 as the list was given, so the picker can present them in the asked-for order. */
  number: number | null;
  name: string;
  /** What a viewer is supposed to take away. One sentence. */
  demonstrates: string;
  /** Two or three things to watch for. These are what make the demo legible. */
  watchFor: readonly string[];
  /** False when the engine cannot stage it against this tenant. Shown, never hidden. */
  available: boolean;
  /** Why it is available, or precisely what is missing. The API promises this is never empty. */
  reason: string;
  /** The order it will run on, when there is one. */
  soNo: string | null;
  customerName: string | null;
  /** What starting it will do, in order, so nothing about the setup is a surprise. */
  setup: readonly string[];
  /** Where in the arc the moment lands, so a presenter knows when to stop talking. */
  momentAt: string;
}

export function normaliseScenarios(data: unknown): Scenario[] {
  const raw = Array.isArray(data)
    ? data
    : Array.isArray((data as { scenarios?: unknown } | null)?.scenarios)
      ? (data as { scenarios: unknown[] }).scenarios
      : [];

  const out: Scenario[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const key = str(s.key) ?? str(s.id);
    const name = str(s.title) ?? str(s.name) ?? str(s.label) ?? key;
    if (!key || !name) continue;
    out.push({
      key,
      number: typeof s.number === "number" ? s.number : null,
      name,
      demonstrates: str(s.demonstrates) ?? str(s.shows) ?? str(s.summary) ?? "",
      watchFor: lines(s.watchFor ?? s.watch ?? s.lookFor),
      // Absent means available: an engine that lists a scenario without saying otherwise is
      // offering it. Only an explicit false takes it off the table.
      available: s.available !== false && s.enabled !== false,
      reason: str(s.reason) ?? "",
      soNo: str(s.soNo),
      customerName: str(s.customerName),
      setup: lines(s.setup),
      momentAt: str(s.momentAt) ?? "",
    });
  }
  // The numbers are the user's own ordering of the nine. Sorted only when the API gave them;
  // otherwise served order is respected, because that is somebody's decision too.
  return out.every((s) => s.number !== null)
    ? out.sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    : out;
}

/** The list, or an empty one. A missing endpoint is not an error worth a red box. */
export async function fetchScenarios(): Promise<Scenario[]> {
  try {
    const r = await api.get<{ data: unknown }>("/fulfilment/scenarios");
    return normaliseScenarios(r.data);
  } catch {
    return [];
  }
}

/**
 * Start one, and return the mission id it produced.
 *
 * The id is dug out of three possible shapes rather than one, for the same reason the list
 * parser is tolerant — and it returns null rather than throwing when it finds none, because
 * the caller's next move (tell the person it did not start) is the same either way.
 */
export async function startScenario(key: string): Promise<string | null> {
  const r = await api.post<{ data: unknown }>(
    `/fulfilment/scenarios/${encodeURIComponent(key)}/start`,
  );
  return missionIdOf(r.data);
}

export function missionIdOf(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return (
    str(d.id) ??
    str(d.missionId) ??
    (d.mission && typeof d.mission === "object"
      ? str((d.mission as Record<string, unknown>).id)
      : null)
  );
}

/** One string or a list of them, always as a list, always without the empty ones. */
function lines(v: unknown): readonly string[] {
  if (Array.isArray(v)) {
    return v.map((x) => str(x)).filter((x): x is string => x !== null);
  }
  const one = str(v);
  return one ? [one] : [];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
