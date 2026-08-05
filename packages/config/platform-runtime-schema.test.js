"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLATFORM_RUNTIME_SCHEMA_MANIFEST,
  getRuntimeSchema,
  resolveRuntimeField,
  validateRuntimeDefinition,
} = require("./platform-runtime-schema");

test("all registered platform runtime modules have generated Prisma fields", () => {
  assert.equal(Object.keys(PLATFORM_RUNTIME_SCHEMA_MANIFEST.modules).length, 17);
  for (const [moduleKey, module] of Object.entries(PLATFORM_RUNTIME_SCHEMA_MANIFEST.modules)) {
    assert.ok(Object.keys(module.fields).length > 0, moduleKey);
    assert.ok(module.model);
  }
});

test("sensitive and system-managed fields are not writable or exportable", () => {
  const platformUser = PLATFORM_RUNTIME_SCHEMA_MANIFEST.models?.PlatformUser;
  assert.equal(platformUser.fields.passwordHash.sensitive, true);
  assert.equal(platformUser.fields.passwordHash.readable, false);
  assert.equal(platformUser.fields.passwordHash.exportable, false);
  assert.equal(getRuntimeSchema("leads").fields.id.systemManaged, true);
  assert.equal(getRuntimeSchema("leads").fields.id.editable, false);
});

test("definition validation rejects missing and unsupported fields", () => {
  const errors = validateRuntimeDefinition({
    key: "leads",
    forms: [{ fields: [{ key: "missing" }] }],
    views: [{ filters: [{ field: "notes", operator: "eq" }], sort: [{ field: "assignedToUser", direction: "asc" }] }],
    columns: [],
  });
  assert.ok(errors.some((error) => error.includes("missing field missing")));
  assert.ok(errors.some((error) => error.includes("not sortable")));
  assert.ok(resolveRuntimeField("leads", "assignedToUser.fullName"));
});
