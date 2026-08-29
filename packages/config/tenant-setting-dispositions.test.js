const test = require("node:test");
const assert = require("node:assert/strict");

const {
  INERT_REASONS,
  INERT_TENANT_SETTING_KEYS,
  INERT_KEYS_WITH_PENDING_UI_REMOVAL,
  isInertTenantSettingKey,
  isTenantSettingControlRenderable,
} = require("./tenant-setting-dispositions");

test("every inert key carries a known reason code", () => {
  const known = new Set(Object.keys(INERT_REASONS));
  for (const [id, reason] of Object.entries(INERT_TENANT_SETTING_KEYS)) {
    assert.ok(known.has(reason), `${id} has unknown reason ${reason}`);
  }
});

test("every entry is a category.key pair, not a bare key", () => {
  // The shape BUG-1977 got wrong in a Prisma query: `category` and `key` are
  // separate things, and 24 keys share a name across two categories.
  for (const id of Object.keys(INERT_TENANT_SETTING_KEYS)) {
    assert.match(id, /^[a-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/, id);
  }
});

test("only the deferred attendance keys still render a control", () => {
  for (const id of INERT_KEYS_WITH_PENDING_UI_REMOVAL) {
    assert.equal(
      INERT_TENANT_SETTING_KEYS[id],
      "DEFERRED_ATTENDANCE_WORK",
      `${id} is exempt from control withdrawal without being deferred work`,
    );
  }
});

test("the deferred set is attendance only, and is meant to reach zero", () => {
  for (const id of INERT_KEYS_WITH_PENDING_UI_REMOVAL) {
    assert.ok(id.startsWith("attendance."), id);
  }
});

test("an inert key is not renderable, an unlisted key is", () => {
  const [inertId] = Object.keys(INERT_TENANT_SETTING_KEYS).filter(
    (id) => INERT_TENANT_SETTING_KEYS[id] !== "DEFERRED_ATTENDANCE_WORK",
  );
  const [category, key] = inertId.split(".");

  assert.equal(isInertTenantSettingKey(category, key), true);
  assert.equal(isTenantSettingControlRenderable(category, key), false);

  // A key nobody listed is live until proven otherwise, so the filter must
  // default to rendering rather than hiding.
  assert.equal(isInertTenantSettingKey("employees", "requireCountry"), false);
  assert.equal(
    isTenantSettingControlRenderable("employees", "requireCountry"),
    true,
  );
});

test("lookup is not fooled by inherited Object properties", () => {
  // A bare `obj[key]` lookup finds `toString` and `constructor` on every object
  // literal. The composite `category.key` id makes that collision impossible in
  // practice, so this pins the belt as well as the braces: both helpers use
  // hasOwnProperty, and neither depends on the id format to stay correct.
  assert.equal(isInertTenantSettingKey("employees", "constructor"), false);
  assert.equal(
    isTenantSettingControlRenderable("employees", "toString"),
    true,
  );
});
