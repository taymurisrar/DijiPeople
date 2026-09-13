const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SINK_EMAIL_PROVIDER_TYPES,
  SUPPORTED_EMAIL_PROVIDER_TYPES,
  selectableEmailProviderTypes,
  sinkEmailProvidersRetired,
} = require("./email-providers");

/*
 * BUG-3501 / ADR-0015 — production retires sink email providers.
 *
 * The truth table matters more than the happy path. The API, the seed and the
 * settings screen all take their answer from these two functions, so a
 * predicate that let `NODE_ENV=development` mask `APP_ENV=production` would
 * put a CONSOLE provider back in front of real tenants everywhere at once.
 */

test("sinks are retired when either variable names production", () => {
  assert.equal(sinkEmailProvidersRetired({ NODE_ENV: "production" }), true);
  assert.equal(sinkEmailProvidersRetired({ APP_ENV: "production" }), true);
  assert.equal(
    sinkEmailProvidersRetired({ NODE_ENV: "development", APP_ENV: "production" }),
    true,
  );
  assert.equal(
    sinkEmailProvidersRetired({ NODE_ENV: " Production ", APP_ENV: "" }),
    true,
  );
});

test("sinks stay available in development, test and an unset environment", () => {
  assert.equal(sinkEmailProvidersRetired({ NODE_ENV: "development" }), false);
  assert.equal(sinkEmailProvidersRetired({ NODE_ENV: "test" }), false);
  assert.equal(sinkEmailProvidersRetired({}), false);
  assert.equal(sinkEmailProvidersRetired(undefined), false);
  assert.equal(sinkEmailProvidersRetired(null), false);
});

test("staging does not retire sinks — the decision is production only", () => {
  assert.equal(sinkEmailProvidersRetired({ APP_ENV: "staging" }), false);
});

test("production offers no sink provider type", () => {
  const selectable = selectableEmailProviderTypes({ NODE_ENV: "production" });
  assert.deepEqual(selectable, ["SMTP"]);
  for (const sink of SINK_EMAIL_PROVIDER_TYPES) {
    assert.equal(selectable.includes(sink), false);
  }
});

test("development offers every supported type, as a copy", () => {
  const selectable = selectableEmailProviderTypes({ NODE_ENV: "development" });
  assert.deepEqual(selectable, [...SUPPORTED_EMAIL_PROVIDER_TYPES]);
  assert.notEqual(selectable, SUPPORTED_EMAIL_PROVIDER_TYPES);
});

test("every sink type is a supported type", () => {
  for (const sink of SINK_EMAIL_PROVIDER_TYPES) {
    assert.equal(SUPPORTED_EMAIL_PROVIDER_TYPES.includes(sink), true);
  }
});
