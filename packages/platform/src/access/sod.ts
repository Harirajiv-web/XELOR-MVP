/**
 * SEGREGATION OF DUTIES (ADMINISTRATION §9.4 `sod_rule`, AI #8).
 *
 * The classic control: nobody should be able to both create an obligation and approve it.
 * One person who can raise a purchase order and approve it can buy anything from anyone;
 * one who can create a vendor and pay it can create a vendor that is themselves.
 *
 * This is a DETERMINISTIC matrix, not a model. A conflict is a pair of roles a rule says
 * must not be held together, and the verdict comes from that table — always. AI #8 may
 * only write the *sentence explaining* a row the rules already produced. The grounding
 * gate below is what enforces that: an explanation that introduces a role, a risk level or
 * a recommendation the finding does not contain is refused and the template is used
 * instead. A model that can reword a verdict can eventually reverse one.
 *
 * MVP posture is DETECTIVE (§17.3): conflicts are found and reported, not blocked, except
 * where a rule is explicitly marked `prevent`. Blocking every classic conflict on day one
 * in a plant that has four office staff and eleven roles between them stops the plant.
 */

export type SodRiskLevel = "critical" | "high" | "medium" | "low";
export type SodEnforcement = "prevent" | "warn" | "detect";

export interface SodRule {
  id: string;
  name: string;
  roleACode: string;
  roleBCode: string;
  riskLevel: SodRiskLevel;
  enforcement: SodEnforcement;
  description: string;
  /** The control that would make holding both acceptable, when one exists. */
  compensatingControl?: string | null;
}

export interface SodFinding {
  ruleId: string;
  ruleName: string;
  subject: string;
  subjectName: string;
  roleACode: string;
  roleBCode: string;
  riskLevel: SodRiskLevel;
  enforcement: SodEnforcement;
  description: string;
  compensatingControl: string | null;
  /** The deterministic sentence. AI #8's baseline, and the fallback when it is off. */
  templateExplanation: string;
}

const RISK_ORDER: Record<SodRiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** The static sentence the eval gate measures against — `sod_rule_static_sentence`. */
export function templateSentence(rule: SodRule, subjectName: string): string {
  return `${subjectName} holds both ${rule.roleACode} and ${rule.roleBCode}. ${rule.description}${
    rule.compensatingControl ? ` Compensating control: ${rule.compensatingControl}.` : ""
  }`;
}

/** Every rule violated by one user's role set. */
export function detectSodConflicts(
  subject: { subject: string; subjectName: string; roleCodes: readonly string[] },
  rules: readonly SodRule[],
): SodFinding[] {
  const held = new Set(subject.roleCodes);
  const findings: SodFinding[] = [];
  for (const r of rules) {
    // A rule is symmetric: holding A and B is the same conflict as holding B and A.
    if (!held.has(r.roleACode) || !held.has(r.roleBCode)) continue;
    findings.push({
      ruleId: r.id,
      ruleName: r.name,
      subject: subject.subject,
      subjectName: subject.subjectName,
      roleACode: r.roleACode,
      roleBCode: r.roleBCode,
      riskLevel: r.riskLevel,
      enforcement: r.enforcement,
      description: r.description,
      compensatingControl: r.compensatingControl ?? null,
      templateExplanation: templateSentence(r, subject.subjectName),
    });
  }
  return findings.sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || a.ruleName.localeCompare(b.ruleName));
}

/** Scan a whole tenant. Returns findings across every user, worst first. */
export function scanSod(
  users: readonly { subject: string; subjectName: string; roleCodes: readonly string[] }[],
  rules: readonly SodRule[],
): SodFinding[] {
  return users
    .flatMap((u) => detectSodConflicts(u, rules))
    .sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || a.subjectName.localeCompare(b.subjectName));
}

/**
 * Whether a proposed grant may proceed.
 *
 * Only a rule marked `prevent` blocks. Everything else is recorded and surfaced, because a
 * control that stops a four-person office from operating gets switched off in week two,
 * and then nothing is controlled at all.
 */
export function checkGrant(
  input: { subject: string; subjectName: string; currentRoleCodes: readonly string[]; newRoleCode: string },
  rules: readonly SodRule[],
): { allowed: boolean; blocking: SodFinding[]; warnings: SodFinding[]; reason: string } {
  const after = [...new Set([...input.currentRoleCodes, input.newRoleCode])];
  const all = detectSodConflicts({ subject: input.subject, subjectName: input.subjectName, roleCodes: after }, rules);
  // Only conflicts the NEW role creates are this grant's business; pre-existing ones are
  // already on the report and blocking on them punishes the wrong action.
  const created = all.filter((f) => f.roleACode === input.newRoleCode || f.roleBCode === input.newRoleCode);
  const blocking = created.filter((f) => f.enforcement === "prevent");
  const warnings = created.filter((f) => f.enforcement !== "prevent");

  if (blocking.length > 0) {
    return {
      allowed: false,
      blocking,
      warnings,
      reason: `Refused: ${blocking.map((b) => b.ruleName).join(", ")}. ${blocking[0]!.description}`,
    };
  }
  return {
    allowed: true,
    blocking,
    warnings,
    reason:
      warnings.length > 0
        ? `Granted, with ${warnings.length} segregation-of-duties conflict(s) recorded for review: ${warnings.map((w) => w.ruleName).join(", ")}.`
        : "Granted. No segregation-of-duties conflict is created by this role.",
  };
}

/**
 * THE GROUNDING GATE for AI #8.
 *
 * The model may only rephrase what the finding already says. This checks that the
 * explanation introduces no role name, no risk level and no recommendation that is not in
 * the finding — and that it does not contradict the verdict by suggesting the pair is
 * acceptable. A failed gate means the template ships instead; nothing is lost except the
 * nicer sentence.
 */
export function groundExplanation(finding: SodFinding, text: string): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  const allowedRoles = new Set([finding.roleACode.toLowerCase(), finding.roleBCode.toLowerCase()]);
  // Any ROLE_LIKE token the finding does not mention is an invented fact.
  for (const token of text.match(/\b[a-z]+(?:_[a-z]+)+\b/gi) ?? []) {
    const t = token.toLowerCase();
    if (allowedRoles.has(t)) continue;
    if (finding.description.toLowerCase().includes(t)) continue;
    if ((finding.compensatingControl ?? "").toLowerCase().includes(t)) continue;
    violations.push(`introduces '${token}', which the finding does not mention`);
  }

  for (const level of ["critical", "high", "medium", "low"] as const) {
    if (level !== finding.riskLevel && new RegExp(`\\b${level}\\s+risk\\b`).test(lower)) {
      violations.push(`states '${level} risk' when the rule says '${finding.riskLevel}'`);
    }
  }

  // The one thing an explanation must never do is argue with the verdict.
  for (const phrase of ["not a conflict", "no conflict", "is acceptable", "can be ignored", "is fine", "safe to hold"]) {
    if (lower.includes(phrase)) violations.push(`contradicts the rule by saying '${phrase}'`);
  }

  // Nor may it invent an instruction — this feature is Tier 3, advisory forever.
  for (const phrase of ["i have removed", "i revoked", "access has been revoked", "i granted", "automatically removed"]) {
    if (lower.includes(phrase)) violations.push(`claims an action was taken ('${phrase}') — this feature never acts`);
  }

  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}
