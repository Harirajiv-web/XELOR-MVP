import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, lte, or, gte, sql } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import {
  AppError,
  type EpfConfig,
  type EsiConfig,
  type GratuityConfig,
  type OtConfig,
  type PtConfig,
  type PtSlab,
  type TdsConfig,
  type WageDefinitionConfig,
} from "@ind-core/platform";

const {
  statWageDefinition,
  statEpfConfig,
  statEsiConfig,
  statPtSlab,
  statTdsConfig,
  statTdsSlab,
  statGratuityConfig,
  statOtConfig,
} = schema;

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));
const nOrNull = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

/**
 * Resolves the effective-dated statutory rate book AS-OF a payroll period (HRM §9.1).
 *
 * This service is the reason the module can claim "statutory rates are data, never code".
 * Every calculator in `@ind-core/platform` takes its numbers as an argument; this is the
 * only place those numbers are fetched, and it always fetches them for a DATE — never
 * "the current ones". A June-2026 payslip recomputed in 2029 therefore uses June-2026's
 * ceiling, June-2026's slabs and June-2026's threshold, which is the difference between an
 * audit you can answer and one you cannot.
 *
 * Each resolved config carries a `configRef` of the form `table:effective_from`, which is
 * persisted on every `statutory_contribution` row so a payslip line can be traced back to
 * the exact rate row that produced it.
 */
@Injectable()
export class StatutoryConfigService {
  /** `effective_from <= asOf < effective_to`, newest first. Missing config is an ERROR. */
  private asOf(column: { effectiveFrom: unknown; effectiveTo: unknown }, date: string) {
    const c = column as { effectiveFrom: never; effectiveTo: never };
    return and(lte(c.effectiveFrom, date), or(isNull(c.effectiveTo), gte(c.effectiveTo, date)));
  }

  private missing(what: string, date: string): never {
    // Guessing a statutory rate is worse than failing: a wrong PF deduction is a debt
    // with interest attached (EPF s.14B), while a refusal is a five-minute config insert.
    throw new AppError(
      "STATUTORY_CONFIG_MISSING",
      422,
      `No ${what} configuration is effective on ${date}; insert an effective-dated row before running payroll.`,
    );
  }

  async wageDefinition(tx: Tx, date: string): Promise<WageDefinitionConfig> {
    const [row] = await tx
      .select()
      .from(statWageDefinition)
      .where(this.asOf(statWageDefinition, date))
      .orderBy(desc(statWageDefinition.effectiveFrom))
      .limit(1);
    if (!row) this.missing("wage definition (s.2(y))", date);
    return { effectiveFrom: row.effectiveFrom, addbackThresholdPct: n(row.addbackThresholdPct) };
  }

  async epf(tx: Tx, date: string): Promise<EpfConfig> {
    const [row] = await tx
      .select()
      .from(statEpfConfig)
      .where(this.asOf(statEpfConfig, date))
      .orderBy(desc(statEpfConfig.effectiveFrom))
      .limit(1);
    if (!row) this.missing("EPF", date);
    return {
      configRef: `stat_epf_config:${row.effectiveFrom}`,
      effectiveFrom: row.effectiveFrom,
      wageCeiling: n(row.wageCeiling),
      employeePct: n(row.employeePct),
      epsPct: n(row.epsPct),
      adminPct: n(row.adminPct),
      edliPct: n(row.edliPct),
    };
  }

  async esi(tx: Tx, date: string): Promise<EsiConfig> {
    const [row] = await tx
      .select()
      .from(statEsiConfig)
      .where(this.asOf(statEsiConfig, date))
      .orderBy(desc(statEsiConfig.effectiveFrom))
      .limit(1);
    if (!row) this.missing("ESI", date);
    return {
      configRef: `stat_esi_config:${row.effectiveFrom}`,
      effectiveFrom: row.effectiveFrom,
      grossThreshold: n(row.grossThreshold),
      employeePct: n(row.employeePct),
      employerPct: n(row.employerPct),
      roundUp: row.roundUp,
    };
  }

  /** PT resolves by STATE (and municipality where the state charges by one). */
  async pt(tx: Tx, date: string, state: string, municipality?: string | null): Promise<PtConfig> {
    const rows = await tx
      .select()
      .from(statPtSlab)
      .where(and(eq(statPtSlab.state, state), this.asOf(statPtSlab, date)))
      .orderBy(asc(statPtSlab.slabFrom));
    const scoped = municipality ? rows.filter((r) => r.municipality === municipality) : rows;
    const use = scoped.length > 0 ? scoped : rows;
    if (use.length === 0) this.missing(`professional tax (${state})`, date);

    const head = use[0]!;
    const slabs: PtSlab[] = use.map((r) => ({
      slabFrom: n(r.slabFrom),
      slabTo: nOrNull(r.slabTo),
      amount: n(r.amount),
      ...(r.amountFebruary != null ? { amountFebruary: n(r.amountFebruary) } : {}),
    }));
    return {
      configRef: `stat_pt_slab:${state}:${head.effectiveFrom}`,
      state,
      effectiveFrom: head.effectiveFrom,
      periodBasis: head.periodBasis as "monthly" | "half_yearly",
      slabs,
      annualCap: n(head.annualCap),
      ...(head.womenExemptUpto != null ? { womenExemptUpto: n(head.womenExemptUpto) } : {}),
      ...(head.municipality ? { municipality: head.municipality } : {}),
    };
  }

  async tds(tx: Tx, date: string, fy: string, regime = "new"): Promise<TdsConfig> {
    const [cfg] = await tx
      .select()
      .from(statTdsConfig)
      .where(and(eq(statTdsConfig.fy, fy), eq(statTdsConfig.regime, regime), this.asOf(statTdsConfig, date)))
      .orderBy(desc(statTdsConfig.effectiveFrom))
      .limit(1);
    if (!cfg) this.missing(`TDS (${fy}, ${regime} regime)`, date);

    const slabRows = await tx
      .select()
      .from(statTdsSlab)
      .where(and(eq(statTdsSlab.fy, fy), eq(statTdsSlab.regime, regime), this.asOf(statTdsSlab, date)))
      .orderBy(asc(statTdsSlab.slabFrom));
    if (slabRows.length === 0) this.missing(`TDS slabs (${fy})`, date);

    return {
      configRef: `stat_tds_config:${fy}:${regime}`,
      fy,
      regime: "new",
      standardDeduction: n(cfg.standardDeduction),
      slabs: slabRows.map((r) => ({
        slabFrom: n(r.slabFrom),
        slabTo: nOrNull(r.slabTo),
        ratePct: n(r.ratePct),
      })),
      rebate87aAmount: n(cfg.rebate87aAmount),
      rebate87aIncomeLimit: n(cfg.rebate87aIncomeLimit),
      cessPct: n(cfg.cessPct),
      actReference: cfg.actReference,
    };
  }

  async gratuity(tx: Tx, date: string): Promise<GratuityConfig> {
    const [row] = await tx
      .select()
      .from(statGratuityConfig)
      .where(this.asOf(statGratuityConfig, date))
      .orderBy(desc(statGratuityConfig.effectiveFrom))
      .limit(1);
    if (!row) this.missing("gratuity", date);
    return {
      effectiveFrom: row.effectiveFrom,
      factorNum: row.factorNum,
      factorDen: row.factorDen,
      vestingYearsDefault: row.vestingYearsDefault,
      vestingYearsFixedTerm: row.vestingYearsFixedTerm,
      taxExemptCap: n(row.taxExemptCap),
      wageBase: "deemed_wages",
    };
  }

  async ot(tx: Tx, date: string): Promise<OtConfig> {
    const [row] = await tx
      .select()
      .from(statOtConfig)
      .where(this.asOf(statOtConfig, date))
      .orderBy(desc(statOtConfig.effectiveFrom))
      .limit(1);
    if (!row) this.missing("overtime", date);
    return {
      effectiveFrom: row.effectiveFrom,
      multiplier: n(row.multiplier),
      rateBasis: "gross_26_8",
      dailyHoursCap: n(row.dailyHoursCap),
      weeklyHoursCap: n(row.weeklyHoursCap),
      quarterlyOtCapHours: n(row.quarterlyOtCapHours),
    };
  }

  /**
   * A stable fingerprint of every config row that will be used for a period. It goes into
   * `payroll_run.inputs_hash`, so a rate change between two computes produces a DIFFERENT
   * hash and forces an explicit recompute rather than silently mixing rate books.
   */
  async configFingerprint(tx: Tx, date: string, fy: string): Promise<string> {
    // Sequential on purpose: a Drizzle transaction wraps ONE pg client, so Promise.all
    // here would issue overlapping queries on a single connection.
    const w = await this.wageDefinition(tx, date);
    const e = await this.epf(tx, date);
    const s = await this.esi(tx, date);
    const t = await this.tds(tx, date, fy);
    const g = await this.gratuity(tx, date);
    const o = await this.ot(tx, date);
    return JSON.stringify({ w, e, s, t, g, o });
  }

  /** The statutory-config viewer (§7.10): the timeline, visibly append-only. */
  async timeline(tx: Tx): Promise<Array<{ statute: string; effectiveFrom: string; summary: string; sourceNote: string | null }>> {
    const rows = await tx.execute(sql`
      SELECT 'wage_definition' AS statute, effective_from::text, source_note,
             'add-back threshold ' || addback_threshold_pct || '%' AS summary
        FROM stat_wage_definition
      UNION ALL
      SELECT 'epf', effective_from::text, source_note,
             'ceiling ' || wage_ceiling || ', employee ' || employee_pct || '%'
        FROM stat_epf_config
      UNION ALL
      SELECT 'esi', effective_from::text, source_note,
             'threshold ' || gross_threshold || ', employee ' || employee_pct || '%'
        FROM stat_esi_config
      UNION ALL
      SELECT 'gratuity', effective_from::text, source_note,
             factor_num || '/' || factor_den || ' on ' || wage_base ||
             ', vesting ' || vesting_years_fixed_term || 'y fixed-term / ' || vesting_years_default || 'y otherwise'
        FROM stat_gratuity_config
      UNION ALL
      SELECT 'overtime', effective_from::text, source_note,
             multiplier || 'x, caps ' || daily_hours_cap || 'h/day ' || weekly_hours_cap || 'h/week'
        FROM stat_ot_config
      ORDER BY 1, 2
    `);
    return (rows.rows as Array<Record<string, string | null>>).map((r) => ({
      statute: String(r.statute),
      effectiveFrom: String(r.effective_from),
      summary: String(r.summary),
      sourceNote: r.source_note ?? null,
    }));
  }
}
