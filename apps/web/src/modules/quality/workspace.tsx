import { AgentModulePage, type AgentModulePageProps } from "@spine/ui/agent-module-page";

export type QmsView =
  | "overview"
  | "documents"
  | "audits"
  | "findings"
  | "corrective-actions"
  | "training"
  | "evidence-packs";

const owner: AgentModulePageProps["agent"] = {
  code: "KILN",
  name: "Quality Agent",
  purpose: "KILN cannot declare compliance. It brings the right evidence together, while people approve documents, findings and closure.",
  accent: "var(--dept-kiln)",
  icon: "ShieldCheck",
};

const commonEvidence = [
  { label: "Inspections", value: "Measured results and disposition records" },
  { label: "Documents", value: "Approved version, owner and change history" },
  { label: "Audits", value: "Plan, checklist, finding and report" },
  { label: "Actions", value: "Owner, due date and effectiveness proof" },
  { label: "People", value: "Training and acknowledgement history" },
  { label: "Safety", value: "Human approval before release or closure" },
] as const;

const pages: Record<QmsView, Omit<AgentModulePageProps, "agent">> = {
  overview: {
    title: "QMS & Audit Overview",
    eyebrow: "Quality management system",
    description: "See whether quality work is under control and whether the proof is ready when an auditor asks.",
    updated: "today at 9:40 AM",
    metrics: [
      { label: "Audit readiness", value: "86%", note: "38 of 44 required checks are ready.", tone: "watch", trend: "+9 pts" },
      { label: "Open findings", value: "7", note: "Two need action this week.", tone: "risk" },
      { label: "Actions on time", value: "92%", note: "23 of 25 actions are on schedule.", tone: "good" },
    ],
    actions: [
      { title: "Close the calibration evidence gap", detail: "The CNC-04 gauge certificate is current, but it is not linked to audit IA-2627-004.", owner: "Meera · Quality", due: "Today", tone: "risk", status: "Evidence missing" },
      { title: "Confirm CAPA effectiveness", detail: "Three clean batches are recorded after the PX-400 seal fix. Quality must decide whether that is enough.", owner: "Quality Manager", due: "2 Aug", tone: "watch", status: "Human decision" },
      { title: "Train the night shift", detail: "Four operators have not acknowledged the new final-inspection work instruction.", owner: "Shift Supervisor", due: "5 Aug", tone: "watch", status: "4 people" },
    ],
    stages: [
      { label: "Control the work", value: "96%", note: "Current procedures available at point of use.", tone: "good" },
      { label: "Find the issue", value: "7", note: "Open inspection, audit and complaint findings.", tone: "watch" },
      { label: "Fix the cause", value: "5", note: "Corrective actions currently active.", tone: "watch" },
      { label: "Prove it worked", value: "2", note: "Awaiting effectiveness confirmation.", tone: "risk" },
    ],
    insight: {
      title: "Most of the audit is ready",
      summary: "KILN found six gaps. Four are missing links to existing proof; two need a real human decision before the evidence pack can be complete.",
      evidence: ["No missing record is called complete.", "Each readiness result points to a source item.", "HEXA checks access and freezes the final exported version."],
      caution: "AI can find and organise evidence. It cannot declare compliance or close a finding.",
    },
    evidence: commonEvidence,
  },
  documents: {
    title: "Controlled Documents",
    eyebrow: "QMS & audit · documents",
    description: "Keep one approved version of every procedure and make older versions easy to trace.",
    updated: "today at 9:36 AM",
    metrics: [
      { label: "Current documents", value: "64", note: "Approved and available for use.", tone: "good" },
      { label: "Review due soon", value: "5", note: "Due in the next 30 days.", tone: "watch" },
      { label: "Change waiting", value: "3", note: "Drafts need review or approval.", tone: "risk" },
    ],
    actions: [
      { title: "Final inspection work instruction", detail: "WI-QA-017 rev 6 adds the PX-400 seal check. Approval is complete; four people still need training.", owner: "Meera", due: "5 Aug", tone: "watch", status: "Released" },
      { title: "Supplier evaluation procedure", detail: "SOP-PU-008 review is due in 12 days. KILN found two related supplier-audit changes.", owner: "Procurement QA", due: "12 Aug", tone: "watch", status: "Review due" },
      { title: "Gauge calibration procedure", detail: "Draft rev 4 changes the reminder period. It cannot replace rev 3 until approved.", owner: "Quality Manager", due: "Awaiting approval", tone: "risk", status: "Draft" },
    ],
    stages: [
      { label: "Draft", value: "3", note: "Work in progress; not for use.", tone: "neutral" },
      { label: "Review", value: "2", note: "Technical review in progress.", tone: "watch" },
      { label: "Approval", value: "1", note: "Waiting for an authorised person.", tone: "risk" },
      { label: "Current", value: "64", note: "Approved point-of-use versions.", tone: "good" },
    ],
    insight: {
      title: "One change affects training and audit evidence",
      summary: "Releasing WI-QA-017 rev 6 created training tasks and automatically marked rev 5 as an older reference without deleting it.",
      evidence: ["The change reason is recorded.", "Approver and release time are retained.", "Affected roles came from the document’s training rule."],
      caution: "KILN may draft change wording. Only an authorised document owner can release a version.",
    },
    evidence: commonEvidence,
  },
  audits: {
    title: "Audit Programme",
    eyebrow: "QMS & audit · audits",
    description: "Plan audits, complete the checks and keep each answer connected to proof.",
    updated: "today at 9:32 AM",
    metrics: [
      { label: "Audits this quarter", value: "8", note: "Five complete, two planned and one active.", tone: "neutral" },
      { label: "Checks complete", value: "91%", note: "For the audit currently in progress.", tone: "watch" },
      { label: "Evidence gaps", value: "3", note: "Checks with no acceptable proof linked yet.", tone: "risk" },
    ],
    actions: [
      { title: "Internal production audit", detail: "IA-2627-004 · 20 of 22 checks complete. Calibration and night-shift training proof remain.", owner: "Meera", due: "Today", tone: "risk", status: "In progress" },
      { title: "Supplier audit · Bharat Alloy", detail: "Plan and checklist are ready. Confirm the supplier attendee before release.", owner: "Procurement QA", due: "8 Aug", tone: "watch", status: "Planned" },
      { title: "Customer process audit", detail: "Evidence pack from the last visit is available as a starting point, with all changed items marked.", owner: "Quality Manager", due: "19 Aug", tone: "neutral", status: "Upcoming" },
    ],
    stages: [
      { label: "Plan", value: "2", note: "Scope, team and dates being prepared.", tone: "neutral" },
      { label: "Check", value: "1", note: "Audit currently being performed.", tone: "watch" },
      { label: "Report", value: "1", note: "Draft report awaiting approval.", tone: "watch" },
      { label: "Complete", value: "5", note: "Approved reports with linked proof.", tone: "good" },
    ],
    insight: {
      title: "Reuse proof, but re-check freshness",
      summary: "KILN found 16 useful items from the previous audit. Twelve are still current; four changed and need fresh review.",
      evidence: ["Every reused item keeps its original source.", "Version and review date are compared.", "Changed evidence is never silently carried forward."],
      caution: "The auditor records the result. AI can suggest questions and locate evidence, but it cannot mark a check conforming.",
    },
    evidence: commonEvidence,
  },
  findings: {
    title: "Quality Findings",
    eyebrow: "QMS & audit · findings",
    description: "Keep every issue in one place, whether it came from an inspection, audit, complaint or supplier.",
    updated: "today at 9:29 AM",
    metrics: [
      { label: "Open findings", value: "7", note: "All sources combined.", tone: "risk" },
      { label: "High priority", value: "2", note: "Needs containment or manager attention.", tone: "risk" },
      { label: "Contained", value: "6", note: "Immediate risk has been controlled.", tone: "good" },
    ],
    actions: [
      { title: "PX-400 seal leakage", detail: "NC-2627-021 · Inspection rejection linked to one customer complaint and two prior similar readings.", owner: "Production Quality", due: "Contained", tone: "risk", status: "Major" },
      { title: "Missing gauge link", detail: "NC-2627-024 · Audit evidence gap. The valid certificate exists but is not connected to the machine record.", owner: "Metrology", due: "Today", tone: "watch", status: "Minor" },
      { title: "Supplier material marking", detail: "NC-2627-019 · Bharat Alloy containment is complete; supplier response is due.", owner: "Supplier Quality", due: "3 Aug", tone: "watch", status: "Supplier" },
    ],
    stages: [
      { label: "New", value: "1", note: "Needs triage and immediate owner.", tone: "risk" },
      { label: "Contained", value: "3", note: "Immediate risk controlled.", tone: "watch" },
      { label: "Cause review", value: "2", note: "Evidence being checked.", tone: "watch" },
      { label: "Action active", value: "1", note: "Corrective work is under way.", tone: "neutral" },
    ],
    insight: {
      title: "PX-400 resembles two earlier events",
      summary: "KILN found matching seal-part, failure-location and reading patterns. It suggests checking the curing setup first.",
      evidence: ["Similarity is based on recorded fields, not wording alone.", "Prior actions and outcomes are shown to the reviewer.", "The current team must confirm the actual cause."],
      caution: "A suggested cause is a lead to investigate, never the confirmed root cause.",
    },
    evidence: commonEvidence,
  },
  "corrective-actions": {
    title: "Corrective Actions",
    eyebrow: "QMS & audit · fix and verify",
    description: "Assign the fix, address the cause and show whether the result stayed effective.",
    updated: "today at 9:24 AM",
    metrics: [
      { label: "Active CAPAs", value: "5", note: "Corrective-action plans in progress.", tone: "watch" },
      { label: "Actions overdue", value: "2", note: "Both need owner or date review.", tone: "risk" },
      { label: "Effectiveness due", value: "2", note: "Evidence exists; closure needs a person.", tone: "watch" },
    ],
    actions: [
      { title: "CAPA-2627-009 · PX-400 seal", detail: "Three clean batches recorded after setup change. Quality Manager must review effectiveness.", owner: "Quality Manager", due: "2 Aug", tone: "watch", status: "Check effectiveness" },
      { title: "CAPA-2627-011 · Gauge traceability", detail: "Machine-to-certificate link is built. One older asset still needs matching.", owner: "Metrology", due: "Overdue 2 days", tone: "risk", status: "Overdue" },
      { title: "CAPA-2627-006 · Supplier marking", detail: "Supplier changed packing label and sent photo proof. Incoming inspection will verify the next lot.", owner: "Supplier Quality", due: "Next receipt", tone: "neutral", status: "Waiting for proof" },
    ],
    stages: [
      { label: "Contain", value: "5/5", note: "Immediate customer or product risk controlled.", tone: "good" },
      { label: "Confirm cause", value: "4/5", note: "One investigation still open.", tone: "watch" },
      { label: "Complete action", value: "3/5", note: "Two actions remain active.", tone: "watch" },
      { label: "Verify result", value: "2/5", note: "Human effectiveness decision required.", tone: "risk" },
    ],
    insight: {
      title: "Evidence is strong enough for review—not auto-closure",
      summary: "The PX-400 action has three successful batches and no repeat complaint, so KILN recommends an effectiveness review now.",
      evidence: ["Batch results are linked to inspections.", "Complaint history is checked through MICA.", "The original finding and approved plan remain visible."],
      caution: "KILN cannot close CAPA. The authorised Quality Manager records the final decision and reason.",
    },
    evidence: commonEvidence,
  },
  training: {
    title: "Quality Training",
    eyebrow: "QMS & audit · people",
    description: "Know who has learned each current procedure and who still needs help.",
    updated: "today at 9:19 AM",
    metrics: [
      { label: "Training current", value: "94%", note: "Across active employees with assigned quality work.", tone: "good" },
      { label: "People overdue", value: "4", note: "All relate to one revised instruction.", tone: "risk" },
      { label: "Due in 30 days", value: "9", note: "Planned refresher or new revision training.", tone: "watch" },
    ],
    actions: [
      { title: "WI-QA-017 rev 6 · Night shift", detail: "Four operators need the new seal-check instruction before their next PX-400 job.", owner: "Night Supervisor", due: "5 Aug", tone: "risk", status: "4 people" },
      { title: "Internal auditor refresher", detail: "Two auditors are due for the annual evidence and interviewing refresher.", owner: "QMS Lead", due: "12 Aug", tone: "watch", status: "2 people" },
      { title: "New inspector induction", detail: "Priya completed reading and demonstration; supervisor observation remains.", owner: "Senior Inspector", due: "3 Aug", tone: "neutral", status: "1 step left" },
    ],
    stages: [
      { label: "Assigned", value: "48", note: "Current active training assignments.", tone: "neutral" },
      { label: "In progress", value: "6", note: "Started but not yet completed.", tone: "watch" },
      { label: "Overdue", value: "4", note: "Past the required date.", tone: "risk" },
      { label: "Complete", value: "42", note: "Acknowledged or demonstrated.", tone: "good" },
    ],
    insight: {
      title: "Prioritise by upcoming work",
      summary: "Two of the four overdue operators are assigned to the next PX-400 order, so they should be trained first.",
      evidence: ["Training rule comes from the current document.", "Employee role comes from RASP people records.", "Upcoming work assignment comes from production."],
      caution: "AI can order the training list. A supervisor still confirms competence where demonstration is required.",
    },
    evidence: commonEvidence,
  },
  "evidence-packs": {
    title: "Audit Evidence Packs",
    eyebrow: "QMS & audit · proof",
    description: "Prepare a checked and traceable set of evidence without searching through folders on audit day.",
    updated: "today at 9:14 AM",
    metrics: [
      { label: "Pack completeness", value: "86%", note: "38 of 44 required checks are ready.", tone: "watch" },
      { label: "Sources verified", value: "38", note: "Each keeps its original record link.", tone: "good" },
      { label: "Gaps to resolve", value: "6", note: "Four links and two human decisions.", tone: "risk" },
    ],
    actions: [
      { title: "Internal production audit pack", detail: "38 items verified. Four existing records need links and two checks need a quality decision.", owner: "Meera", due: "Today", tone: "risk", status: "86% ready" },
      { title: "Northstar customer pack", detail: "Previous pack copied as a new version. Eleven changed items are clearly marked for review.", owner: "Customer Quality", due: "15 Aug", tone: "watch", status: "Draft" },
      { title: "Bharat Alloy supplier pack", detail: "Audit plan, supplier rating and incoming findings are linked. Supplier attendee is not confirmed.", owner: "Supplier Quality", due: "8 Aug", tone: "neutral", status: "Planned" },
    ],
    stages: [
      { label: "Collect", value: "44", note: "Required evidence items identified.", tone: "neutral" },
      { label: "Verify", value: "38", note: "Source and current version checked.", tone: "good" },
      { label: "Review", value: "6", note: "Gaps waiting for action or decision.", tone: "risk" },
      { label: "Freeze & share", value: "Human", note: "HEXA verifies approved export.", tone: "ai" },
    ],
    insight: {
      title: "No more ‘complete’ packs with silent gaps",
      summary: "KILN labels every missing or changed item. HEXA then freezes the approved version so the shared pack cannot change unnoticed.",
      evidence: ["Each item records its source, version and reviewer.", "Reused evidence is checked for freshness.", "Every export creates an audit event."],
      caution: "A pack is evidence for an audit; it is not an AI-issued compliance certificate.",
    },
    evidence: commonEvidence,
  },
};

export function QmsWorkspace({ view }: { view: QmsView }): React.JSX.Element {
  return <AgentModulePage {...pages[view]} agent={owner} />;
}
