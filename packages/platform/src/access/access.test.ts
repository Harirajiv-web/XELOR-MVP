import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectivePermissions, explainAccess, isValidPermission, explainInvalidPermission, parsePermission, type RoleGrant } from "./permissions.js";
import { scopeFor, rowInScope, describeScope, type ScopeGrant } from "./scope.js";
import { applyFieldRules, resolveFieldRules, maskValue, rejectUnwritableFields, type FieldRule } from "./masking.js";
import { checkApiKey, issueApiKey, rateLimitVerdict, verifySecret } from "./api-key.js";

const GRANTS: RoleGrant[] = [
  { roleId: "r1", roleCode: "stores_incharge", roleName: "Stores In-charge", isPrivileged: false, permissions: ["inventory.stock.read", "inventory.stock.write"] },
  { roleId: "r2", roleCode: "buyer", roleName: "Buyer", isPrivileged: false, permissions: ["purchase.po.create", "inventory.stock.read"] },
];

describe("permission strings", () => {
  it("accepts module.entity.action and rejects everything else", () => {
    assert.equal(isValidPermission("purchase.po.submit"), true);
    assert.equal(isValidPermission("purchase.po"), false);
    assert.equal(isValidPermission("Purchase.PO.Submit"), false);
  });

  it("accepts an OPERATIONAL verb, because 46 of this system's permissions use one", () => {
    // hrm.payroll.approve says what it guards; hrm.payroll.amend does not. The 13 document
    // actions are a recommended vocabulary, and treating them as closed would have made
    // 46 real permissions impossible to catalogue, explain or grant.
    assert.equal(isValidPermission("hrm.payroll.approve"), true);
    assert.equal(isValidPermission("planning.mrp.run"), true);
    assert.equal(parsePermission("hrm.payroll.approve")!.isDocumentAction, false);
    assert.equal(parsePermission("purchase.po.submit")!.isDocumentAction, true);
  });

  it("a typo is caught by CATALOGUE MEMBERSHIP, not by a compiled-in list", () => {
    // `aprove` is a perfectly well-shaped verb — a hard-coded list could only reject it by
    // also rejecting `approve`, `run` and `post`. Nothing registered it, so nothing grants it.
    assert.equal(isValidPermission("purchase.po.aprove"), true);
  });

  it("names the shape when the string is not one", () => {
    assert.match(explainInvalidPermission("admin"), /module.entity.action/);
    assert.match(explainInvalidPermission("a.b.c.d"), /exactly three/);
  });
});

describe("effective permissions", () => {
  it("reports every role a permission arrives through, not just one", () => {
    const eff = effectivePermissions(GRANTS);
    const stockRead = eff.find((e) => e.permission === "inventory.stock.read")!;
    assert.deepEqual(stockRead.viaRoles, ["buyer", "stores_incharge"]);
  });

  it("warns that revoking one role will not remove a doubly-granted permission", () => {
    const d = explainAccess("inventory.stock.read", GRANTS);
    assert.equal(d.allowed, true);
    assert.match(d.reason, /revoking one of them will not remove/);
  });

  it("denies by default and names the roles the user actually holds", () => {
    const d = explainAccess("accounts.journal.submit", GRANTS);
    assert.equal(d.allowed, false);
    assert.match(d.reason, /none of this user's roles \(buyer, stores_incharge\)/);
  });

  it("a user with no roles is denied, not defaulted into anything", () => {
    const d = explainAccess("inventory.stock.read", []);
    assert.equal(d.allowed, false);
    assert.match(d.reason, /holds no roles at all/);
  });

  it("a denial names the roles that WOULD grant it — the actionable half", () => {
    const d = explainAccess("accounts.journal.submit", GRANTS, [
      { permission: "accounts.journal.submit", grantedByRoles: ["accountant", "finance_controller"] },
    ]);
    assert.deepEqual(d.wouldBeGrantedBy, ["accountant", "finance_controller"]);
  });
});

describe("row scoping", () => {
  const SCOPES: ScopeGrant[] = [
    { dimension: "plant", valueId: "pune" },
    { dimension: "plant", valueId: "coimbatore", applyToDocType: "stock_entry" },
  ];

  it("NO scope means no access — never all access", () => {
    const r = scopeFor("work_order", []);
    assert.equal(r.unrestricted, false);
    assert.deepEqual(r.scopes, []);
    assert.match(r.reason, /no access, not all access/);
    assert.equal(rowInScope({ plant: "pune" }, r), false);
  });

  it("restricts to the assigned values", () => {
    const r = scopeFor("work_order", SCOPES);
    assert.equal(rowInScope({ plant: "pune" }, r), true);
    assert.equal(rowInScope({ plant: "coimbatore" }, r), false, "that grant is scoped to stock_entry only");
  });

  it("a doctype-specific scope applies only to its doctype", () => {
    const r = scopeFor("stock_entry", SCOPES);
    assert.equal(rowInScope({ plant: "coimbatore" }, r), true);
  });

  it("dimensions are ANDed — a plant grant does not reach every cost centre in it", () => {
    const r = scopeFor("work_order", [
      { dimension: "plant", valueId: "pune" },
      { dimension: "cost_center", valueId: "CC-PRD" },
    ]);
    assert.equal(rowInScope({ plant: "pune", cost_center: "CC-PRD" }, r), true);
    assert.equal(rowInScope({ plant: "pune", cost_center: "CC-ADM" }, r), false);
  });

  it("unrestricted is only ever an explicit grant", () => {
    const r = scopeFor("work_order", [], { hasUnrestrictedRole: true });
    assert.equal(r.unrestricted, true);
    assert.equal(rowInScope({ plant: "anything" }, r), true);
    assert.match(describeScope("work_order", r), /unrestricted row access/);
  });

  it("a row missing the scoped column fails closed", () => {
    const r = scopeFor("work_order", SCOPES);
    assert.equal(rowInScope({}, r), false);
    assert.equal(rowInScope({ plant: null }, r), false);
  });
});

describe("field masking", () => {
  const RULES: FieldRule[] = [
    { docType: "work_order", fieldName: "standardCost", access: "masked", maskFormat: "amount_band" },
    { docType: "work_order", fieldName: "standardCost", access: "editable" }, // a second role says editable
    { docType: "work_order", fieldName: "internalNote", access: "hidden" },
    { docType: "work_order", fieldName: "orderNo", access: "read_only" },
    { docType: "other_doc", fieldName: "orderNo", access: "hidden" },
  ];

  it("the MOST RESTRICTIVE rule wins when roles disagree", () => {
    const resolved = resolveFieldRules("work_order", RULES);
    assert.equal(resolved.get("standardCost")!.access, "masked",
      "otherwise the way to see a masked salary is to collect roles until one forgets to mask it");
  });

  it("rules from another doctype do not leak across", () => {
    const resolved = resolveFieldRules("work_order", RULES);
    assert.equal(resolved.get("orderNo")!.access, "read_only");
  });

  it("a hidden field is REMOVED from the payload, not blanked", () => {
    const resolved = resolveFieldRules("work_order", RULES);
    const out = applyFieldRules({ orderNo: "MO-1", standardCost: 8500, internalNote: "secret" }, resolved);
    assert.equal("internalNote" in out.row, false, "a blanked key still tells you the field exists");
    assert.deepEqual(out.hidden, ["internalNote"]);
  });

  it("a masked value is rendered, never passed through", () => {
    const resolved = resolveFieldRules("work_order", RULES);
    const out = applyFieldRules({ standardCost: 8500 }, resolved);
    assert.notEqual(out.row.standardCost, 8500);
    assert.match(String(out.row.standardCost), /1,000–10,000/);
  });

  it("an unknown mask format redacts rather than revealing", () => {
    assert.equal(maskValue("secret-value", "no-such-format"), "•••");
    assert.equal(maskValue("4111111111111234", "last4"), "••••••••••••1234");
    assert.equal(maskValue("Hari Rajiv", "initials"), "H. R.");
    assert.equal(maskValue("a@b.com", "domain_only"), "•••@b.com");
  });

  it("writing a masked field is REFUSED, not silently dropped", () => {
    const resolved = resolveFieldRules("work_order", RULES);
    const v = rejectUnwritableFields({ standardCost: 1 }, resolved);
    assert.equal(v.ok, false);
    assert.match(v.reason, /would look like it saved/);
  });

  it("an ordinary editable field passes through untouched", () => {
    const resolved = resolveFieldRules("work_order", RULES);
    assert.equal(rejectUnwritableFields({ qty: 5 }, resolved).ok, true);
  });
});

describe("API keys", () => {
  const NOW = "2026-07-20T10:00:00.000Z";

  it("the secret is verifiable but never recoverable from what is stored", () => {
    const k = issueApiKey("live");
    assert.equal(verifySecret(k.secret, k.secretHash), true);
    assert.equal(verifySecret(`${k.secret}x`, k.secretHash), false);
    assert.equal(k.secretHash.includes(k.secret), false);
  });

  const rec = (over: Partial<Parameters<typeof checkApiKey>[1] & object> = {}) => ({
    prefix: "ik_l_abc123",
    secretHash: "",
    scopes: ["production.output.create"],
    status: "active" as const,
    rateLimitRpm: 60,
    ...over,
  });

  it("authorises exactly the scope it was issued for", () => {
    const k = issueApiKey();
    const r = rec({ secretHash: k.secretHash });
    assert.equal(checkApiKey(k.secret, r, { scope: "production.output.create", asOf: NOW }).ok, true);
    const denied = checkApiKey(k.secret, r, { scope: "accounts.journal.submit", asOf: NOW });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "scope_denied");
  });

  it("a revoked key says REVOKED, not unknown", () => {
    const k = issueApiKey();
    const r = checkApiKey(k.secret, rec({ secretHash: k.secretHash, status: "revoked" }), { scope: "production.output.create", asOf: NOW });
    assert.equal(r.code, "revoked");
    assert.match(r.reason, /reconfigure the device/);
  });

  it("distinguishes an unknown prefix from a wrong secret", () => {
    const k = issueApiKey();
    assert.equal(checkApiKey(k.secret, null, { scope: "x", asOf: NOW }).code, "unknown_key");
    assert.equal(checkApiKey("ik_l_zzz.wrong", rec({ secretHash: k.secretHash }), { scope: "x", asOf: NOW }).code, "bad_secret");
  });

  it("expiry and IP allowlists are enforced", () => {
    const k = issueApiKey();
    assert.equal(checkApiKey(k.secret, rec({ secretHash: k.secretHash, expiresAt: "2026-01-01T00:00:00Z" }), { scope: "production.output.create", asOf: NOW }).code, "expired");
    assert.equal(checkApiKey(k.secret, rec({ secretHash: k.secretHash, ipAllowlist: ["10.0.0.1"] }), { scope: "production.output.create", ip: "10.0.0.9", asOf: NOW }).code, "ip_denied");
  });

  it("reports the rate-limit headroom rather than just refusing", () => {
    assert.deepEqual(rateLimitVerdict(10, 60).remaining, 50);
    assert.equal(rateLimitVerdict(60, 60).allowed, false);
  });
});
