import assert from "node:assert/strict";
import test from "node:test";
import { INSTALLED_MODULES } from "@modules/registry";
import { erpCoreManifest } from "../product/erp-core";
import { getProductProfile } from "../product/profile";
import { DEFAULT_CONFIG, ERP_ACTIONS, INDUSTRIES, ROLES, WORKFLOWS, actionLabel, searchActions } from "./workspace-model";

test("every ERP destination and workflow step resolves to an actual core screen", () => {
  const profile = getProductProfile("1");
  assert.equal(profile.name, "XELOR phase 2");
  assert.equal(profile.port, 4001);
  assert.equal(new Set(ERP_ACTIONS.map(action => action.id)).size, ERP_ACTIONS.length);
  for (const action of ERP_ACTIONS) {
    const [,key,path] = action.href.split("/");
    assert.ok(key && path && profile.modules.includes(key),action.href);
    const manifest = INSTALLED_MODULES.find(module => module.key === key);
    assert.ok(manifest,action.href);
    const core = erpCoreManifest(manifest);
    assert.ok(core.nav.some(entry => entry.path === path && !entry.hidden),action.href);
    assert.ok(core.screens[path],action.href);
  }
  for (const workflow of WORKFLOWS) for (const step of workflow.steps) assert.ok(ERP_ACTIONS.some(action => action.id === step.action),step.action);
});

test("the ERP profile excludes connected products and standalone applications without changing ONYX", () => {
  const core = getProductProfile("1");
  for (const key of ["network","connectivity","agentos","copilot","decisionworkspace","maintenance","csp","working-capital","managed-services"]) assert.ok(!core.modules.includes(key),key);
  assert.equal(getProductProfile("2").name,"ONYX");
  assert.equal(getProductProfile("2").port,4101);
  assert.ok(getProductProfile("4").modules.includes("maintenance"));
});

test("workflow search finds operational language and configured terminology", () => {
  assert.ok(searchActions(ERP_ACTIONS,"goods receipt",DEFAULT_CONFIG).some(action=>action.id==="purchase-orders"));
  assert.ok(searchActions(ERP_ACTIONS,"supplier performance",DEFAULT_CONFIG).some(action=>action.id==="suppliers"));
  assert.ok(searchActions(ERP_ACTIONS,"bill of material",DEFAULT_CONFIG).some(action=>action.id==="items"));
  const config={...DEFAULT_CONFIG,terminology:{...DEFAULT_CONFIG.terminology,item:"Components"}};
  assert.ok(searchActions(ERP_ACTIONS,"components",config).some(action=>action.id==="items"));
  assert.equal(actionLabel(ERP_ACTIONS.find(action=>action.id==="items")!,config),"Components & bills of material");
  assert.equal(searchActions(ERP_ACTIONS,"nonexistent-capability",config).length,0);
});

test("industry and role starting points use valid destinations and do not mutate defaults", () => {
  const before=JSON.stringify(DEFAULT_CONFIG);
  for (const preset of INDUSTRIES) {
    assert.ok(preset.actions.length<=8);
    for (const action of preset.actions) assert.ok(ERP_ACTIONS.some(entry=>entry.id===action));
    for (const department of preset.departments) assert.ok(DEFAULT_CONFIG.visibleDepartments.includes(department));
  }
  for (const role of ROLES) for (const action of role.actions) assert.ok(ERP_ACTIONS.some(entry=>entry.id===action));
  assert.equal(JSON.stringify(DEFAULT_CONFIG),before);
});
