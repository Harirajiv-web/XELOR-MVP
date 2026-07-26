import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkGrant, detectSodConflicts, groundExplanation, scanSod, templateSentence, type SodRule } from "./sod.js";
import { checkRetentionFloor, dsrClock, incidentClock } from "./compliance.js";
import { chainHash, GENESIS_HASH as GENESIS, verifyChainDetailed as verifyChain, type ChainRow } from "../audit/hash-chain.js";

const RULES: SodRule[] = [
  {
    id: "sod-1", name: "Raise and approve a purchase order",
    roleACode: "buyer", roleBCode: "purchase_approver",
    riskLevel: "critical", enforcement: "prevent",
    description: "One person who can both raise a purchase order and approve it can buy anything from anyone.",
    compensatingControl: null,
  },
  {
    id: "sod-2", name: "Create a vendor and pay it",
    roleACode: "vendor_master", roleBCode: "payments",
    riskLevel: "critical", enforcement: "warn",
    description: "Creating a vendor and paying it allows payment to a vendor that is the same person.",
    compensatingControl: "Every new vendor's first payment is reviewed by the finance controller",
  },
  {
    id: "sod-3", name: "Post a journal and close the period",
    roleACode: "accountant", roleBCode: "finance_controller",
    riskLevel: "high", enforcement: "detect",
    description: "Posting entries and closing the period allows an adjustment nobody else sees.",
    compensatingControl: null,
  },
];

describe("segregation of duties", () => {
  it("finds a conflict only when BOTH roles are held", () => {
    assert.equal(detectSodConflicts({ subject: "u1", subjectName: "Priya", roleCodes: ["buyer"] }, RULES).length, 0);
    const f = detectSodConflicts({ subject: "u1", subjectName: "Priya", roleCodes: ["buyer", "purchase_approver"] }, RULES);
    assert.equal(f.length, 1);
    assert.equal(f[0]!.ruleName, "Raise and approve a purchase order");
  });

  it("orders findings by risk, worst first", () => {
    const f = detectSodConflicts(
      { subject: "u1", subjectName: "Priya", roleCodes: ["accountant", "finance_controller", "vendor_master", "payments"] },
      RULES,
    );
    assert.equal(f[0]!.riskLevel, "critical");
    assert.equal(f[f.length - 1]!.riskLevel, "high");
  });

  it("scans a whole tenant", () => {
    const all = scanSod(
      [
        { subject: "u1", subjectName: "Priya", roleCodes: ["buyer", "purchase_approver"] },
        { subject: "u2", subjectName: "Anil", roleCodes: ["buyer"] },
      ],
      RULES,
    );
    assert.equal(all.length, 1);
    assert.equal(all[0]!.subjectName, "Priya");
  });

  it("only a `prevent` rule blocks a grant — the rest are recorded", () => {
    const blocked = checkGrant({ subject: "u1", subjectName: "Priya", currentRoleCodes: ["buyer"], newRoleCode: "purchase_approver" }, RULES);
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason, /buy anything from anyone/);

    const warned = checkGrant({ subject: "u2", subjectName: "Anil", currentRoleCodes: ["vendor_master"], newRoleCode: "payments" }, RULES);
    assert.equal(warned.allowed, true, "blocking every classic conflict in a four-person office stops the plant");
    assert.equal(warned.warnings.length, 1);
    assert.match(warned.reason, /recorded for review/);
  });

  it("a grant is judged on the conflicts IT creates, not ones that already existed", () => {
    const r = checkGrant(
      { subject: "u1", subjectName: "Priya", currentRoleCodes: ["accountant", "finance_controller"], newRoleCode: "buyer" },
      RULES,
    );
    assert.equal(r.allowed, true);
    assert.equal(r.warnings.length, 0, "the pre-existing accountant/controller conflict is not this grant's fault");
  });

  it("the deterministic sentence names both roles and the risk", () => {
    const s = templateSentence(RULES[1]!, "Anil");
    assert.match(s, /Anil holds both vendor_master and payments/);
    assert.match(s, /Compensating control/);
  });
});

describe("AI #8 grounding gate — the model may only rephrase the finding", () => {
  const finding = detectSodConflicts({ subject: "u1", subjectName: "Priya", roleCodes: ["buyer", "purchase_approver"] }, RULES)[0]!;

  it("accepts a faithful rewording", () => {
    const r = groundExplanation(finding, "Priya can both raise a purchase order and approve it, so a purchase could be made with no second pair of eyes.");
    assert.equal(r.ok, true, r.violations.join("; "));
  });

  it("REFUSES an explanation that invents a role", () => {
    const r = groundExplanation(finding, "Priya holds buyer, purchase_approver and finance_controller.");
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /finance_controller/);
  });

  it("REFUSES an explanation that changes the risk level", () => {
    const r = groundExplanation(finding, "This is a low risk combination of buyer and purchase_approver.");
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /low risk.*critical/);
  });

  it("REFUSES an explanation that argues with the verdict", () => {
    for (const text of ["This is not a conflict in practice.", "Holding both is acceptable here.", "It is safe to hold both."]) {
      assert.equal(groundExplanation(finding, text).ok, false, text);
    }
  });

  it("REFUSES an explanation that claims it acted — this feature is advisory forever", () => {
    const r = groundExplanation(finding, "I have removed purchase_approver from Priya.");
    assert.equal(r.ok, false);
    assert.match(r.violations.join(" "), /never acts/);
  });
});

describe("the CERT-In six-hour clock", () => {
  const detected = "2026-07-20T09:00:00.000Z";

  it("runs from DETECTION, not from confirmation", () => {
    const c = incidentClock({ detectedAt: detected, certInReportable: true, piiAffected: false, asOf: "2026-07-20T11:00:00.000Z" });
    assert.equal(c.certInDueAt, "2026-07-20T15:00:00.000Z");
    assert.equal(c.certInHoursRemaining, 4);
    assert.equal(c.status, "on_track");
  });

  it("turns urgent inside two hours and breached after six", () => {
    assert.equal(incidentClock({ detectedAt: detected, certInReportable: true, piiAffected: false, asOf: "2026-07-20T14:00:00.000Z" }).status, "urgent");
    const b = incidentClock({ detectedAt: detected, certInReportable: true, piiAffected: false, asOf: "2026-07-20T18:00:00.000Z" });
    assert.equal(b.status, "breached");
    assert.match(b.message, /passed 3 hour\(s\) ago/);
  });

  it("runs the DPDP 72-hour clock IN PARALLEL when personal data is affected", () => {
    const c = incidentClock({ detectedAt: detected, certInReportable: true, piiAffected: true, asOf: "2026-07-20T10:00:00.000Z" });
    assert.equal(c.dpdpBoardDueAt, "2026-07-23T09:00:00.000Z");
    assert.match(c.message, /Data Protection Board/);
  });

  it("a late report is recorded as late and cannot be edited out", () => {
    const c = incidentClock({ detectedAt: detected, certInReportable: true, piiAffected: false, certInReportedAt: "2026-07-20T17:00:00.000Z", asOf: "2026-07-21T00:00:00.000Z" });
    assert.equal(c.status, "reported");
    assert.equal(c.breached, true);
    assert.match(c.message, /cannot be edited out/);
  });

  it("a non-reportable incident still gets its clock recorded", () => {
    const c = incidentClock({ detectedAt: detected, certInReportable: false, piiAffected: false, asOf: detected });
    assert.equal(c.status, "not_reportable");
    assert.match(c.message, /classification can change/);
  });
});

describe("the DPDP 90-day request clock", () => {
  it("is 90 days from receipt and warns well before the deadline", () => {
    const c = dsrClock({ receivedAt: "2026-07-20", status: "open", asOf: "2026-07-20" });
    assert.equal(c.dueAt, "2026-10-18");
    assert.equal(c.daysRemaining, 90);
    assert.equal(c.status, "on_track");
    assert.equal(dsrClock({ receivedAt: "2026-07-20", status: "open", asOf: "2026-09-25" }).status, "approaching");
  });

  it("reports an overdue request as overdue", () => {
    const c = dsrClock({ receivedAt: "2026-07-20", status: "in_progress", asOf: "2026-10-25" });
    assert.equal(c.status, "overdue");
    assert.match(c.message, /Overdue by 7 day/);
  });

  it("a statutory hold refuses erasure and says which obligation", () => {
    const c = dsrClock({ receivedAt: "2026-07-20", status: "refused_statutory_hold", statutoryHoldRefs: "Companies Act 8-year books retention", asOf: "2026-08-01" });
    assert.match(c.message, /8-year books retention/);
    assert.match(c.message, /cannot override a retention obligation/);
  });
});

describe("retention floors", () => {
  it("refuses a setting below its statutory floor", () => {
    const r = checkRetentionFloor("audit.retention_years", 5);
    assert.equal(r.ok, false);
    assert.match(r.reason, /floor is 8/);
    assert.match(r.reason, /never for less/);
  });

  it("allows longer than the law requires", () => {
    assert.equal(checkRetentionFloor("audit.retention_years", 10).ok, true);
    assert.equal(checkRetentionFloor("logs.security_min_retention_days", 180).ok, true);
  });

  it("a key with no statutory floor is unconstrained", () => {
    assert.equal(checkRetentionFloor("ui.page_size", 10).ok, true);
  });
});

describe("the audit hash chain", () => {
  function build(payloads: string[]): ChainRow[] {
    const rows: ChainRow[] = [];
    let prev = GENESIS;
    payloads.forEach((payload, i) => {
      const rowHash = chainHash(prev, payload);
      rows.push({ seq: i + 1, prevHash: prev, rowHash, payload });
      prev = rowHash;
    });
    return rows;
  }

  it("verifies an intact chain", () => {
    const v = verifyChain(build(["a", "b", "c"]));
    assert.equal(v.intact, true);
    assert.equal(v.rowsChecked, 3);
  });

  it("an EDITED row breaks the chain and is reported as a content change", () => {
    const rows = build(["a", "b", "c"]);
    rows[1] = { ...rows[1]!, payload: "b-tampered" };
    const v = verifyChain(rows);
    assert.equal(v.intact, false);
    assert.equal(v.firstBreakSeq, 2);
    assert.equal(v.breakKind, "hash_mismatch");
    assert.match(v.message, /Content changed at 2/);
  });

  it("a DELETED row is reported as a gap, not as a content change", () => {
    const rows = build(["a", "b", "c"]).filter((r) => r.seq !== 2);
    const v = verifyChain(rows);
    assert.equal(v.breakKind, "sequence_gap");
    assert.match(v.message, /A row was deleted, not altered/);
  });

  it("a RE-SIGNED row is reported as a broken link", () => {
    const rows = build(["a", "b", "c"]);
    rows[2] = { ...rows[2]!, prevHash: chainHash(GENESIS, "something-else") };
    const v = verifyChain(rows);
    assert.equal(v.breakKind, "link_mismatch");
    assert.match(v.message, /replaced or re-signed/);
  });

  it("an empty chain is intact, not broken", () => {
    assert.equal(verifyChain([]).intact, true);
  });
});
