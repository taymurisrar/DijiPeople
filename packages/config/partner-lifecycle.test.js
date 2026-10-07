const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const {
  PARTNER_PHASES,
  PARTNER_STATUS_VALUES,
  PARTNER_STATUS_PHASES,
  PARTNER_STATUS_LABELS,
  PARTNER_LIFECYCLE_ACTIONS,
  PARTNER_ACCOUNT_STATUS_DEFINITIONS,
  PARTNER_POST_ACTIVATION_STATUSES,
  PARTNER_ONBOARDED_STATUSES,
  partnerPhaseOf,
  canApplyPartnerAction,
} = require("./partner-lifecycle");

/*
 * ADR-0026. The phase is derived from PartnerStatus, so a status added to the
 * schema without a phase would render as no phase at all and fall out of every
 * process bar. The enum is read from schema.prisma itself, not copied, so this
 * fails the day the schema grows a value this module does not know.
 */
function prismaEnum(name) {
  const schema = readFileSync(
    join(__dirname, "../../services/api/prisma/schema.prisma"),
    "utf8",
  );
  const block = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(schema);
  assert.ok(block, `enum ${name} not found in schema.prisma`);
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => /^[A-Z_][A-Z0-9_]*$/.test(line));
}

test("every PartnerStatus in the schema has exactly one phase and a label", () => {
  const schemaValues = prismaEnum("PartnerStatus");
  assert.equal(schemaValues.length, 24, "the schema's PartnerStatus changed size");
  assert.deepEqual([...PARTNER_STATUS_VALUES].sort(), [...schemaValues].sort());
  for (const value of schemaValues) {
    assert.ok(PARTNER_PHASES.includes(PARTNER_STATUS_PHASES[value]), value);
    assert.ok(PARTNER_STATUS_LABELS[value], `${value} has no label`);
  }
});

test("every PartnerAccountStatus has a label and an explanation", () => {
  const schemaValues = prismaEnum("PartnerAccountStatus");
  assert.deepEqual(
    PARTNER_ACCOUNT_STATUS_DEFINITIONS.map((definition) => definition.value).sort(),
    [...schemaValues].sort(),
  );
  for (const definition of PARTNER_ACCOUNT_STATUS_DEFINITIONS) {
    assert.ok(definition.label && definition.explanation, definition.value);
  }
});

test("every phase is reachable and the live/closed ends map where expected", () => {
  for (const phase of PARTNER_PHASES)
    assert.ok(Object.values(PARTNER_STATUS_PHASES).includes(phase), phase);
  assert.equal(partnerPhaseOf("DRAFT"), "PROSPECT");
  assert.equal(partnerPhaseOf("INFORMATION_APPROVED"), "ONBOARDING");
  assert.equal(partnerPhaseOf("ACTIVE"), "ACTIVE");
  assert.equal(partnerPhaseOf("SUSPENDED"), "SUSPENDED");
  for (const closed of ["INACTIVE", "TERMINATED", "REJECTED"])
    assert.equal(partnerPhaseOf(closed), "CLOSED");
  assert.equal(partnerPhaseOf("NOT_A_STATUS"), null);
  assert.equal(partnerPhaseOf(undefined), null);
});

test("action rules name only real statuses", () => {
  const known = new Set(prismaEnum("PartnerStatus"));
  for (const [action, rule] of Object.entries(PARTNER_LIFECYCLE_ACTIONS)) {
    assert.ok(known.has(rule.to), `${action}.to`);
    assert.ok(rule.from.length > 0, `${action}.from is empty`);
    for (const from of rule.from) assert.ok(known.has(from), `${action}.from ${from}`);
  }
  for (const status of PARTNER_POST_ACTIVATION_STATUSES) assert.ok(known.has(status));
});

test("activation is offered where onboarding approval leaves the partner", () => {
  // The admin once hid Activate in exactly this state.
  assert.equal(canApplyPartnerAction("activate", "INFORMATION_APPROVED"), true);
  assert.equal(canApplyPartnerAction("activate", "ONBOARDING_PENDING"), false);
  assert.equal(canApplyPartnerAction("activate", "ACTIVE"), false);
  assert.equal(canApplyPartnerAction("no-such-action", "ACTIVE"), false);
});

test("the onboarding link is sent after the agreement and never to a live or closed partner", () => {
  // EXECPLAN-0055 WP-05: it once demoted an ACTIVE partner to ONBOARDING_PENDING.
  const rule = PARTNER_LIFECYCLE_ACTIONS["send-onboarding-link"];
  assert.equal(rule.admin, "send-onboarding-link");
  assert.equal(rule.to, "ONBOARDING_INVITED");
  assert.equal(canApplyPartnerAction("send-onboarding-link", "AGREEMENT_EXECUTED"), true);
  // A resend from the invited state replaces a lost or expired link.
  assert.equal(canApplyPartnerAction("send-onboarding-link", "ONBOARDING_INVITED"), true);
  for (const status of [
    ...PARTNER_POST_ACTIVATION_STATUSES,
    ...PARTNER_ONBOARDED_STATUSES,
    "REJECTED",
    "DRAFT",
    "APPROVED_AWAITING_AGREEMENT",
  ])
    assert.equal(canApplyPartnerAction("send-onboarding-link", status), false, status);
  for (const status of PARTNER_ONBOARDED_STATUSES)
    assert.equal(partnerPhaseOf(status) === "PROSPECT", false, status);
});
