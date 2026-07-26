import { createHash } from "node:crypto";

/**
 * PROMPT LIFECYCLE (AI-OPERATIONS §11, FR-AIO-020..029).
 *
 * A prompt change is the most frequent and least controlled change in an AI product. It
 * looks like editing a string and behaves like deploying code: it changes what the system
 * says to every user, it cannot be reviewed by reading a diff of the output, and in most
 * products it ships with nobody's name on it.
 *
 * So a prompt version here is treated exactly like a release:
 *  - it is **content-addressed**, so "which prompt produced this answer" has an answer;
 *  - it is **immutable in production** — a change is a new version, never an edit;
 *  - it is **promoted by a second person** (author ≠ approver), enforced in the database;
 *  - it can be **rolled back**, and the rollback states its blast radius before it happens.
 */

export type PromptStage = "draft" | "staged" | "production" | "rolled_back" | "retired";

export interface PromptVersion {
  featureKey: string;
  version: number;
  stage: PromptStage;
  template: string;
  /** Variables the template is allowed to interpolate. */
  declaredVariables: readonly string[];
  outputSchema?: string | null;
  contentHash: string;
  authorId: string;
  approverId?: string | null;
}

export function hashPrompt(template: string, outputSchema?: string | null): string {
  return createHash("sha256").update(template).update("\n--schema--\n").update(outputSchema ?? "").digest("hex");
}

export interface TemplateValidation {
  ok: boolean;
  usedVariables: string[];
  undeclared: string[];
  unused: string[];
  errors: string[];
}

const VAR_RE = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

/**
 * Strict template validation.
 *
 * An undeclared variable is an ERROR rather than an empty string. The failure it prevents
 * is specific and silent: `{{invoiceTotal}}` misspelt as `{{invoiceTotl}}` renders as
 * nothing, the model is asked to categorise a receipt with no total, and it obliges with a
 * plausible guess. Nothing crashes and the output looks fine.
 */
export function validateTemplate(template: string, declared: readonly string[]): TemplateValidation {
  const errors: string[] = [];
  const used = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) used.add(m[1]!);

  const undeclared = [...used].filter((v) => !declared.includes(v)).sort();
  const unused = declared.filter((v) => !used.has(v)).sort();

  if (undeclared.length > 0) {
    errors.push(
      `Undeclared variable(s): ${undeclared.join(", ")}. A misspelt variable renders as an empty string, the model is asked to reason about a missing value, and it obliges — nothing crashes and the output looks fine.`,
    );
  }
  // Unbalanced braces produce a template that renders a literal `{{` to the model.
  const opens = (template.match(/\{\{/g) ?? []).length;
  const closes = (template.match(/\}\}/g) ?? []).length;
  if (opens !== closes) errors.push(`Unbalanced braces: ${opens} '{{' against ${closes} '}}'.`);
  if (template.trim().length === 0) errors.push("An empty template is not a prompt.");

  return { ok: errors.length === 0, usedVariables: [...used].sort(), undeclared, unused, errors };
}

export interface PromptDiff {
  templateChanged: boolean;
  schemaChanged: boolean;
  addedLines: string[];
  removedLines: string[];
  variablesAdded: string[];
  variablesRemoved: string[];
  summary: string;
  /** True when the change alters what the model is ASKED FOR, not merely how. */
  materialChange: boolean;
}

/**
 * Diff two versions.
 *
 * `materialChange` is the field a reviewer actually needs: a wording tweak and a change to
 * the output schema or the variable set are the same size on screen and completely
 * different in consequence.
 */
export function diffPrompts(from: PromptVersion, to: PromptVersion): PromptDiff {
  const fromLines = from.template.split("\n");
  const toLines = to.template.split("\n");
  const fromSet = new Set(fromLines);
  const toSet = new Set(toLines);
  const addedLines = toLines.filter((l) => !fromSet.has(l) && l.trim());
  const removedLines = fromLines.filter((l) => !toSet.has(l) && l.trim());

  const fromVars = new Set(validateTemplate(from.template, from.declaredVariables).usedVariables);
  const toVars = new Set(validateTemplate(to.template, to.declaredVariables).usedVariables);
  const variablesAdded = [...toVars].filter((v) => !fromVars.has(v)).sort();
  const variablesRemoved = [...fromVars].filter((v) => !toVars.has(v)).sort();

  const schemaChanged = (from.outputSchema ?? "") !== (to.outputSchema ?? "");
  const materialChange = schemaChanged || variablesAdded.length > 0 || variablesRemoved.length > 0;

  return {
    templateChanged: from.contentHash !== to.contentHash,
    schemaChanged,
    addedLines,
    removedLines,
    variablesAdded,
    variablesRemoved,
    materialChange,
    summary: materialChange
      ? `MATERIAL: ${schemaChanged ? "the output schema changed" : ""}${schemaChanged && (variablesAdded.length || variablesRemoved.length) ? "; " : ""}${variablesAdded.length ? `+${variablesAdded.join(", ")}` : ""}${variablesRemoved.length ? ` −${variablesRemoved.join(", ")}` : ""}. This changes what the model is asked for, not only how — re-run the eval.`
      : `${addedLines.length} line(s) added, ${removedLines.length} removed. Wording only; the model is asked for the same thing.`,
  };
}

export interface PromotionCheck {
  allowed: boolean;
  reason: string;
  requires: string[];
}

/**
 * Whether a version may go to production.
 *
 * Three conditions, and none of them is a warning:
 *  - the template must validate;
 *  - the eval gate must have PASSED for this exact content hash — a gate that passed for a
 *    previous version proves nothing about this one;
 *  - the approver must not be the author.
 *
 * The last is the one people ask to skip on a Friday. It stays, because the whole point of
 * the control is that it binds when it is inconvenient.
 */
export function canPromote(input: {
  version: PromptVersion;
  templateValid: boolean;
  evalPassedForHash: string | null;
  approverId: string | null;
}): PromotionCheck {
  const requires: string[] = [];
  if (!input.templateValid) requires.push("a template that validates");
  if (input.evalPassedForHash !== input.version.contentHash) {
    requires.push(
      input.evalPassedForHash == null
        ? "an eval run that PASSED for this version"
        : "a PASSING eval for THIS content hash — the passing run covers a different version",
    );
  }
  if (!input.approverId) requires.push("an approver");
  else if (input.approverId === input.version.authorId) requires.push("an approver who is not the author");

  if (requires.length === 0) {
    return { allowed: true, reason: `v${input.version.version} may be promoted: template valid, eval passed for this exact content, approved by a second person.`, requires };
  }
  return {
    allowed: false,
    reason: `Promotion refused. Still needs: ${requires.join("; ")}. The gate is not a warning.`,
    requires,
  };
}

export interface RollbackPlan {
  fromVersion: number;
  toVersion: number;
  /** Calls made on the version being rolled back — the blast radius. */
  affectedCalls: number;
  affectedTenants: number;
  message: string;
}

/**
 * A rollback, with its blast radius stated BEFORE it happens.
 *
 * "Roll back" sounds free. It is not: every answer produced by the bad version is still in
 * the system, on documents people have already acted on, and the number of them is the
 * first thing an operator needs and the last thing most consoles show.
 */
export function planRollback(input: {
  fromVersion: number;
  toVersion: number;
  callsOnBadVersion: number;
  tenantsAffected: number;
}): RollbackPlan {
  return {
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    affectedCalls: input.callsOnBadVersion,
    affectedTenants: input.tenantsAffected,
    message:
      input.callsOnBadVersion === 0
        ? `Rolling v${input.fromVersion} back to v${input.toVersion}. Nothing was served by it, so there is nothing to review.`
        : `Rolling v${input.fromVersion} back to v${input.toVersion}. ${input.callsOnBadVersion} call(s) across ${input.tenantsAffected} tenant(s) were already answered by it — the rollback stops new ones, it does not un-answer those. Review them.`,
  };
}
