import { Injectable } from "@nestjs/common";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  encryptField,
  decryptField,
  resolveFieldKey,
  maskFor,
  isValidPanFormat,
  isValidAadhaarFormat,
  AppError,
  Errors,
  type CursorPage,
  type PiiField,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { employee, employeeJobHistory, piiAccessLog, outboxEvent } = schema;

/** The three fields the module treats as sensitive, and the column each lives in. */
const PII_COLUMNS = {
  pan: "panEnc",
  aadhaar: "aadhaarEnc",
  bank_account: "bankAccountEnc",
} as const satisfies Record<PiiField, string>;

export interface CreateEmployeeInput {
  empCode: string;
  firstName: string;
  lastName?: string;
  gender?: "male" | "female" | "other";
  employmentType: "permanent" | "probation" | "trainee" | "fixed_term" | "contract" | "apprentice";
  fixedTermEndDate?: string;
  dateOfJoining: string;
  ptState: string;
  ptMunicipality?: string;
  epfCeilingPolicy?: "capped_at_15000" | "actual";
  locationRef?: string;
  department?: string;
  designation?: string;
  costCentre?: string;
  defaultShiftId?: string;
  reportingManagerId?: string;
}

export interface EmployeeView {
  id: string;
  empCode: string;
  name: string;
  gender: string | null;
  employmentType: string;
  dateOfJoining: string;
  status: string;
  department: string | null;
  designation: string | null;
  ptState: string;
  epfCeilingPolicy: string;
  /** Masked by default, always. The plaintext requires an audited reveal. */
  pan: string | null;
  aadhaar: string | null;
  bankAccount: string | null;
  piiLegalBasis: string;
}

/**
 * The employee master (HRM §4.A) and the DPDP plumbing around it.
 *
 * The privacy posture here is precise rather than decorative. Employment data is a
 * **"legitimate use" under DPDP s.7** — no consent is collected, because none is required,
 * and pretending otherwise would be consent theatre. What IS required, and is implemented:
 * PAN / Aadhaar / bank are encrypted at rest with the tenant and field bound into the
 * ciphertext, they are MASKED in every response by default, and every unmask writes a
 * `pii_access_log` row carrying the reason the viewer typed — on a table where UPDATE and
 * DELETE are revoked and blocked by trigger.
 *
 * The wording used externally is always "DPDP-ready", never "DPDP-compliant", in 2026.
 */
@Injectable()
export class EmployeeService {
  constructor(private readonly audit: AuditLogService) {}

  private key(): Buffer {
    return resolveFieldKey();
  }

  async create(input: CreateEmployeeInput): Promise<EmployeeView> {
    const { tenantId, actorId } = currentTenant();
    if (input.employmentType === "fixed_term" && !input.fixedTermEndDate) {
      // Without an end date there is no computable vesting horizon, and fixed-term staff
      // vest gratuity at one year — the very case this module exists to get right.
      throw Errors.validation([
        { field: "fixedTermEndDate", message: "required for a fixed-term employee" },
      ]);
    }

    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(employee).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        empCode: input.empCode,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        gender: input.gender ?? null,
        employmentType: input.employmentType,
        fixedTermEndDate: input.fixedTermEndDate ?? null,
        dateOfJoining: input.dateOfJoining,
        status: "active",
        ptState: input.ptState,
        ptMunicipality: input.ptMunicipality ?? null,
        epfCeilingPolicy: input.epfCeilingPolicy ?? "capped_at_15000",
        locationRef: input.locationRef ?? null,
        department: input.department ?? null,
        designation: input.designation ?? null,
        costCentre: input.costCentre ?? null,
        defaultShiftId: input.defaultShiftId ?? null,
        reportingManagerId: input.reportingManagerId ?? null,
        piiLegalBasis: "legitimate_use_employment",
        piiNoticeVersion: "v1.0",
      });

      // Placement is effective-dated from day one, so a later transfer appends rather
      // than overwrites where this person worked in June.
      await tx.insert(employeeJobHistory).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        employeeId: id,
        effectiveFrom: input.dateOfJoining,
        changeType: "hire",
        department: input.department ?? null,
        designation: input.designation ?? null,
        costCentre: input.costCentre ?? null,
      });

      await this.audit.appendInTx(tx, {
        action: "hrm.employee.created",
        entityType: "employee",
        entityId: id,
        data: { empCode: input.empCode, employmentType: input.employmentType },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("hrm", "employee", "changed"),
        payload: { employeeId: id, empCode: input.empCode, change: "created" },
        createdAt: new Date(),
      });

      return this.viewInTx(tx, id);
    });
  }

  /**
   * Store a sensitive field. Format is validated FIRST — a mistyped Aadhaar is far cheaper
   * to reject here than to discover after it has been encrypted and can no longer be eyeballed.
   */
  async setPii(employeeId: string, field: PiiField, value: string): Promise<{ masked: string }> {
    const { tenantId, actorId } = currentTenant();
    const clean = value.trim().toUpperCase();

    if (field === "pan" && !isValidPanFormat(clean)) {
      throw Errors.validation([{ field: "pan", message: "not a valid PAN (AAAAA9999A)" }]);
    }
    if (field === "aadhaar" && !isValidAadhaarFormat(clean)) {
      throw Errors.validation([
        { field: "aadhaar", message: "not a valid Aadhaar number (12 digits, Verhoeff checksum)" },
      ]);
    }

    const envelope = encryptField(clean, { tenantId, field: `employee.${field}` }, this.key());
    return withTenant(async (tx) => {
      const column = PII_COLUMNS[field];
      await tx
        .update(employee)
        .set({ [column]: envelope, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(employee.id, employeeId));
      await this.audit.appendInTx(tx, {
        action: "hrm.employee.pii_set",
        entityType: "employee",
        entityId: employeeId,
        // The audit log records THAT it was set, never the value.
        data: { field, masked: maskFor(field, clean) },
      });
      return { masked: maskFor(field, clean) };
    });
  }

  /**
   * The audited unmask (§7.3). A reason is mandatory — the guard rejects an empty one, and
   * so does a CHECK constraint on the log table. The reveal is recorded before the value is
   * returned, so a crash cannot lose the record of an access that already happened.
   */
  async revealPii(employeeId: string, field: PiiField, reason: string): Promise<{ field: PiiField; value: string }> {
    const { tenantId, actorId } = currentTenant();
    if (!reason || reason.trim().length === 0) {
      throw Errors.validation([{ field: "reason", message: "a reason is required to reveal PII" }]);
    }

    return withTenant(async (tx) => {
      const [row] = await tx.select().from(employee).where(eq(employee.id, employeeId)).limit(1);
      if (!row) throw new AppError("EMPLOYEE_NOT_FOUND", 404, `No employee ${employeeId}.`);
      const envelope = row[PII_COLUMNS[field]];
      if (!envelope) throw new AppError("PII_NOT_SET", 404, `No ${field} recorded for this employee.`);

      await tx.insert(piiAccessLog).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        employeeId,
        field,
        viewedBy: actorId,
        reason: reason.trim(),
      });
      await this.audit.appendInTx(tx, {
        action: "hrm.employee.pii_revealed",
        entityType: "employee",
        entityId: employeeId,
        data: { field, reason: reason.trim() },
      });

      return {
        field,
        value: decryptField(envelope, { tenantId, field: `employee.${field}` }, this.key()),
      };
    });
  }

  async accessLog(employeeId: string): Promise<Array<{ field: string; viewedBy: string; viewedAt: string; reason: string }>> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(piiAccessLog)
        .where(eq(piiAccessLog.employeeId, employeeId))
        .orderBy(asc(piiAccessLog.viewedAt));
      return rows.map((r) => ({
        field: r.field,
        viewedBy: r.viewedBy,
        viewedAt: r.viewedAt.toISOString(),
        reason: r.reason,
      }));
    });
  }

  async get(employeeId: string): Promise<EmployeeView> {
    return withTenant((tx) => this.viewInTx(tx, employeeId));
  }

  async list(limit: number, cursor?: string): Promise<CursorPage<EmployeeView>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select()
        .from(employee)
        .where(
          keyset
            ? and(
                eq(employee.isActive, true),
                or(
                  gt(employee.createdAt, new Date(keyset.createdAt)),
                  and(eq(employee.createdAt, new Date(keyset.createdAt)), gt(employee.id, keyset.id)),
                ),
              )
            : eq(employee.isActive, true),
        )
        .orderBy(asc(employee.createdAt), asc(employee.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => this.toView(r)),
        nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      };
    });
  }

  private async viewInTx(tx: Tx, employeeId: string): Promise<EmployeeView> {
    const [row] = await tx.select().from(employee).where(eq(employee.id, employeeId)).limit(1);
    if (!row) throw new AppError("EMPLOYEE_NOT_FOUND", 404, `No employee ${employeeId}.`);
    return this.toView(row);
  }

  /**
   * The ONLY projection this service returns. Note what it cannot do: it never decrypts.
   * A masked view is produced from the ciphertext's presence alone, so no code path that
   * merely lists employees can accidentally surface a PAN.
   */
  private toView(row: typeof employee.$inferSelect): EmployeeView {
    return {
      id: row.id,
      empCode: row.empCode,
      name: [row.firstName, row.lastName].filter(Boolean).join(" "),
      gender: row.gender,
      employmentType: row.employmentType,
      dateOfJoining: row.dateOfJoining,
      status: row.status,
      department: row.department,
      designation: row.designation,
      ptState: row.ptState,
      epfCeilingPolicy: row.epfCeilingPolicy,
      pan: row.panEnc ? "******____" : null,
      aadhaar: row.aadhaarEnc ? "XXXX XXXX ____" : null,
      bankAccount: row.bankAccountEnc ? "**********____" : null,
      piiLegalBasis: row.piiLegalBasis,
    };
  }
}
