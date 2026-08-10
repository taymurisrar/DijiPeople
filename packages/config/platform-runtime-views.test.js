"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLATFORM_MODULE_VIEW_RULES,
  listRuntimeViewKeys,
  resolveRuntimeViewRule,
  runtimeViewLabel,
} = require("./platform-runtime-views");
const {
  PLATFORM_RUNTIME_SCHEMA_MANIFEST,
  resolveRuntimeField,
} = require("./platform-runtime-schema");

/*
 * The view rules are written by hand; the schema is generated from Prisma.
 * A renamed enum member or dropped column would otherwise leave a tab that
 * loads, filters on a value nothing can match, and shows an empty grid — the
 * exact failure these rules were added to remove. So every rule is checked
 * against the generated manifest.
 */

test("every rule points at a field the module really has", () => {
  for (const [moduleKey, rules] of Object.entries(PLATFORM_MODULE_VIEW_RULES)) {
    assert.ok(
      PLATFORM_RUNTIME_SCHEMA_MANIFEST.modules[moduleKey],
      `${moduleKey} is not a platform runtime module`,
    );
    for (const [viewKey, rule] of Object.entries(rules)) {
      const field = resolveRuntimeField(moduleKey, rule.field);
      assert.ok(field, `${moduleKey}.${viewKey} -> missing field ${rule.field}`);
      assert.ok(
        field.filterable,
        `${moduleKey}.${viewKey} -> ${rule.field} is not filterable`,
      );
      assert.ok(rule.label.trim().length > 0, `${moduleKey}.${viewKey} label`);
    }
  }
});

test("every status value a view filters on exists in the enum", () => {
  for (const [moduleKey, rules] of Object.entries(PLATFORM_MODULE_VIEW_RULES)) {
    for (const [viewKey, rule] of Object.entries(rules)) {
      if (!rule.values) continue;
      const field = resolveRuntimeField(moduleKey, rule.field);
      if (!field.enumValues.length) {
        /* Booleans such as isActive carry no enum; the value must match type. */
        assert.ok(
          rule.values.every((value) => typeof value === "boolean"),
          `${moduleKey}.${viewKey} -> ${rule.field} is not an enum`,
        );
        continue;
      }
      for (const value of rule.values) {
        assert.ok(
          field.enumValues.includes(value),
          `${moduleKey}.${viewKey} -> ${value} is not a valid ${rule.field}`,
        );
      }
    }
  }
});

test("a personal view never falls back to showing everyone's records", () => {
  for (const [moduleKey, rules] of Object.entries(PLATFORM_MODULE_VIEW_RULES)) {
    const personal = rules["my-records"];
    if (!personal) continue;
    assert.ok(
      /UserId$|ById$/.test(personal.field),
      `${moduleKey} my-records must filter on an owner column, got ${personal.field}`,
    );
    assert.equal(personal.values, undefined, `${moduleKey} my-records`);
  }
});

test("modules without an owner or a dependable status omit the view", () => {
  /* Offering an empty tab is the defect; absence is the correct outcome. */
  assert.deepEqual(listRuntimeViewKeys("commissions"), ["all", "active"]);
  assert.deepEqual(listRuntimeViewKeys("partner-onboarding"), [
    "all",
    "active",
  ]);
  /*
   * Modules that declare their own views own them completely; the shared map
   * must stay out so nothing offers a tab the module's service will not read.
   */
  for (const bespoke of [
    "leads",
    "partners",
    "contracts",
    "support-cases",
    "monitoring-incidents",
  ]) {
    assert.deepEqual(listRuntimeViewKeys(bespoke), ["all"], bespoke);
  }
  assert.deepEqual(listRuntimeViewKeys("invoices"), [
    "all",
    "active",
    "my-records",
  ]);
});

test("an unknown module or view resolves to no rule rather than throwing", () => {
  assert.equal(resolveRuntimeViewRule("nope", "active"), null);
  assert.equal(resolveRuntimeViewRule("invoices", "all"), null);
  assert.equal(resolveRuntimeViewRule("invoices", undefined), null);
  assert.equal(resolveRuntimeViewRule("invoices", "invented"), null);
  assert.deepEqual(listRuntimeViewKeys("nope"), ["all"]);
});

test("labels describe what the tab actually shows", () => {
  /* "Active invoices" meant nothing; outstanding ones are the point. */
  assert.equal(runtimeViewLabel("invoices", "active"), "Outstanding");
  assert.equal(runtimeViewLabel("partner-inquiries", "active"), "Open");
  assert.equal(
    runtimeViewLabel("signature-requests", "active"),
    "Awaiting signature",
  );
  assert.equal(runtimeViewLabel("invoices", "all"), "All");
  assert.equal(runtimeViewLabel("invoices", "invented"), null);
});
