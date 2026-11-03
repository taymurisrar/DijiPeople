import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEnforcementGate } from "./verify-entitlement-enforcement.mjs";

const prod = (extra = {}) => ({ NODE_ENV: "production", ...extra });

test("production with ENFORCE passes", () => {
  const r = evaluateEnforcementGate(prod({ ENTITLEMENT_ENFORCEMENT_MODE: "ENFORCE" }));
  assert.equal(r.ok, true);
  assert.equal(r.status, "ENFORCED");
});

test("production with the variable missing FAILS the gate", () => {
  const r = evaluateEnforcementGate(prod());
  assert.equal(r.ok, false);
  assert.match(r.message, /not set/);
});

test("production with OFF or REPORT_ONLY FAILS the gate", () => {
  for (const mode of ["OFF", "REPORT_ONLY", "report_only"]) {
    const r = evaluateEnforcementGate(prod({ ENTITLEMENT_ENFORCEMENT_MODE: mode }));
    assert.equal(r.ok, false, mode);
  }
});

test("a malformed value FAILS even though the API would fail closed at runtime", () => {
  const r = evaluateEnforcementGate(prod({ ENTITLEMENT_ENFORCEMENT_MODE: "ENFORCED" }));
  assert.equal(r.ok, false);
  assert.match(r.message, /not exactly ENFORCE/);
});

test("a lower-case enforce is not accepted: the setting must be exactly right", () => {
  const r = evaluateEnforcementGate(prod({ ENTITLEMENT_ENFORCEMENT_MODE: "enforce" }));
  assert.equal(r.ok, false);
});

test("an explicit acknowledgement lets a release through, loudly", () => {
  const r = evaluateEnforcementGate(prod({ ENTITLEMENT_ALLOW_UNENFORCED: "true" }));
  assert.equal(r.ok, true);
  assert.equal(r.status, "ACKNOWLEDGED_UNENFORCED");
  assert.equal(
    evaluateEnforcementGate(prod({ ENTITLEMENT_ALLOW_UNENFORCED: "yes" })).ok,
    false,
  );
});

test("non-production environments are not gated", () => {
  assert.equal(evaluateEnforcementGate({ NODE_ENV: "development" }).status, "SKIPPED");
  assert.equal(evaluateEnforcementGate({}).ok, true);
});
