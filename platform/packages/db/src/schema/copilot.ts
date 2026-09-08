import { index, integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * THE COPILOT'S QUESTION LOG.
 *
 * Every question is recorded — answered, refused, misunderstood alike. The refusals are
 * the more valuable half: a log of only the successful ones says the assistant is doing
 * well, while a log containing everything it could not understand is both the roadmap for
 * what to build next and the evidence that a question about payroll was turned away rather
 * than quietly answered.
 *
 * WHAT IS DELIBERATELY NOT HERE: the answer. Storing the returned rows would create a
 * second copy of business data outside the tables whose access rules protect it — a log
 * that would then need securing as carefully as the ledger, and that would leak a payroll
 * figure to anyone who could read "the copilot log". What is kept is enough to reconstruct
 * any answer from the source of truth: which catalogue question ran, with which parameters,
 * over which tables, returning how many rows, for whom, and when.
 *
 * `question` IS stored, because it is the user's own words and the whole point of the log.
 * It is tenant-scoped and fenced like everything else.
 */
export const copilotQuestion = pgTable(
  "copilot_question",
  {
    ...tenantScopedColumns,
    /** The question as typed. */
    question: text("question").notNull(),
    /** Which catalogue entry it resolved to — null when nothing matched. */
    intentKey: text("intent_key"),
    /** answered | refused | clarify | forbidden | no_query */
    outcome: text("outcome").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    /** deterministic | model | none — which router decided. */
    routedBy: text("routed_by").notNull().default("deterministic"),
    /** Parameters as understood, so a misread is visible after the fact. */
    params: jsonb("params").notNull().default({}),
    /** The tables the query actually read. */
    sources: jsonb("sources").notNull().default([]),
    rowCount: integer("row_count").notNull().default(0),
  },
  (t) => [
    index("ix_copilot_q_tenant_time").on(t.tenantId, t.createdAt),
    index("ix_copilot_q_tenant_outcome").on(t.tenantId, t.outcome),
  ],
);
