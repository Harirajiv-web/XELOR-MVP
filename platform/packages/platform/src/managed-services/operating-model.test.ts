import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MANAGED_SERVICE_LIFECYCLE,
  MANAGED_SERVICE_RESPONSIBILITIES,
  managedServiceDemoSnapshot,
} from "./operating-model.js";

describe("RELAY managed-service operating model", () => {
  it("has one unique accountable record for every responsibility", () => {
    const keys = MANAGED_SERVICE_RESPONSIBILITIES.map((item) => item.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(
      MANAGED_SERVICE_RESPONSIBILITIES.every(
        (item) => item.accountable.length > 0,
      ),
    );
  });

  it("covers design, transition, operate and improve exactly once", () => {
    assert.deepEqual(
      MANAGED_SERVICE_LIFECYCLE.map((stage) => stage.key),
      ["design", "transition", "operate", "improve"],
    );
  });

  it("keeps technical ownership with the specialist while RELAY coordinates incidents", () => {
    const snapshot = managedServiceDemoSnapshot();
    assert.ok(snapshot.incidents.length > 0);
    for (const incident of snapshot.incidents) {
      assert.equal(incident.coordinator, "RELAY");
      assert.notEqual(incident.technicalOwner, "RELAY");
      assert.ok(incident.nextUpdate.length > 0);
      assert.ok(incident.evidence.length > 0);
    }
  });

  it("separates private detection from incident coordination and repair", () => {
    const detection = MANAGED_SERVICE_RESPONSIBILITIES.find(
      (item) => item.key === "platform-health-detection",
    );
    const incident = MANAGED_SERVICE_RESPONSIBILITIES.find(
      (item) => item.key === "service-incident",
    );
    assert.equal(detection?.accountable, "ACHILES");
    assert.equal(incident?.accountable, "RELAY");
    assert.match(detection?.boundary ?? "", /cannot diagnose root cause/i);
  });

  it("labels the MVP dataset as illustrative rather than a live 24x7 claim", () => {
    const snapshot = managedServiceDemoSnapshot();
    assert.equal(snapshot.evidenceMode, "illustrative_demo_operating_model");
    assert.match(snapshot.boundary, /not proof/i);
  });
});
