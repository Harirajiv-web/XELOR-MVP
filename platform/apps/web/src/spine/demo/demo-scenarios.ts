import type { DemoRecordKind } from "./demo-events";

export type DemoPhase =
  | "Discover"
  | "Capture"
  | "Digitise"
  | "Validate"
  | "Trigger"
  | "Investigate"
  | "Calculate"
  | "Coordinate"
  | "Govern"
  | "Human decision"
  | "Execute"
  | "Verify"
  | "Close";

export interface DemoStep {
  phase: DemoPhase;
  title: string;
  path: string;
  body: string;
  presenterLine: string;
  agents: string[];
  /** A short plain-language hand-off shown only in the high-level agent tour. */
  connectionLine?: string;
  /** A real document the presenter must create before Next unlocks. */
  interaction?: {
    recordKind: DemoRecordKind;
    instruction: string;
  };
}

export interface DemoScenario {
  id: string;
  title: string;
  category: string;
  severity: "Urgent" | "High" | "Medium";
  duration: string;
  problem: string;
  decision: string;
  outcome: string;
  icon: string;
  accent: string;
  kind?: "business-story" | "agent-tour";
  scale?: "full";
  /** Whether the named record is seeded in the live demo database or narration-only. */
  evidenceMode?: "live" | "illustrative" | "structural";
  demoRecord?: {
    reference: string;
    subject: string;
    facts: readonly { label: string; value: string }[];
  };
  steps: DemoStep[];
}

/**
 * THE GUIDED DEMO SCENARIOS — DELIBERATELY EMPTY.
 *
 * This file used to carry twelve scripted stories, each with a `demoRecord` block of stated
 * facts: a named customer, an order reference, a rupee value, a promised date, a count of
 * dispatched and quarantined units. The guide never wrote any of it to the database — it is
 * narration — but narration shown beside the real screens is read as fact, and against a
 * company with no customers, no orders and no stock every one of those facts was false.
 *
 * The types and the `demoScenarios` export are unchanged, so the launcher and the presenter
 * keep compiling and simply have nothing to offer. Restoring a story means seeding the records
 * it names, so the screens the guide opens actually show what the script says they show.
 */
export const demoScenarios: DemoScenario[] = [];
