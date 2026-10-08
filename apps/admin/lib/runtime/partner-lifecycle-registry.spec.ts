import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTNER_LIFECYCLE_ACTIONS,
  PARTNER_PHASES,
  PARTNER_STATUS_VALUES,
  partnerPhaseOf,
} from "@repo/config";
import { getPlatformModuleDefinition } from "./platform-module-registry";
import { emptyEditOutcome } from "./runtime-write-payload";

/**
 * The partner record page offers what the API will accept (ADR-0026,
 * EXECPLAN-0055 WP-04).
 *
 * The console hid Activate in INFORMATION_APPROVED — the one state where it
 * succeeds — showed it in ONBOARDING_PENDING where it must fail, never offered
 * Deactivate although the API implements it, listed 13 of 24 statuses, and
 * drew the process bar as the first fifteen statuses in declaration order.
 */
const definition = getPlatformModuleDefinition("partners");
const commands = new Map(
  definition.actions.map((action) => [action.key, action] as const),
);

/*
 * Which API action each partner command runs. `approve-partner` and
 * `reject-partner` reach qualifyInquiry/rejectInquiry, which accept any partner
 * still in the funnel; the shared table's `from` is a subset of that, so
 * offering exactly it never offers a command the API refuses.
 */
const COMMAND_ACTION = Object.fromEntries(
  Object.entries(PARTNER_LIFECYCLE_ACTIONS).map(([action, rule]) => [
    rule.admin,
    action,
  ]),
);

describe("partner lifecycle commands", () => {
  it.each(Object.entries(COMMAND_ACTION))(
    "%s is offered in exactly the statuses the API accepts",
    (commandKey, action) => {
      const command = commands.get(commandKey);
      expect(command).toBeDefined();
      expect([...(command?.states ?? [])].sort()).toEqual(
        [
          ...PARTNER_LIFECYCLE_ACTIONS[
            action as keyof typeof PARTNER_LIFECYCLE_ACTIONS
          ].from,
        ].sort(),
      );
    },
  );

  it("offers Activate after onboarding approval and not before it", () => {
    const states = commands.get("activate")?.states ?? [];
    expect(states).toContain("INFORMATION_APPROVED");
    expect(states).not.toContain("ONBOARDING_PENDING");
    expect(states).not.toContain("ACTIVE");
  });

  it("declares Deactivate, which the API implements", () => {
    expect(commands.get("deactivate-partner")).toMatchObject({
      scope: "record",
      destructive: true,
    });
  });

  it.each(["reject-partner", "suspend-partner", "deactivate-partner"])(
    "%s collects a reason before it runs",
    (commandKey) => {
      expect(commands.get(commandKey)?.reasonPrompt?.label).toEqual(
        expect.any(String),
      );
    },
  );

  it("routes every API-dispatched partner command through the record action contract", () => {
    const contract = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "../../../../services/api/src/modules/platform-runtime/record-actions.contract.json",
        ),
        "utf8",
      ),
    ) as { partners: string[] };
    for (const commandKey of Object.keys(COMMAND_ACTION))
      expect(contract.partners).toContain(commandKey);
  });
});

describe("partner status presentation", () => {
  const fields = new Map(
    definition.forms
      .find((form) => form.key === "edit")!
      .fields.map((field) => [field.key, field] as const),
  );

  it("lists every PartnerStatus once", () => {
    expect(definition.statuses.map((item) => item.value).sort()).toEqual(
      [...PARTNER_STATUS_VALUES].sort(),
    );
  });

  it("does not paint INACTIVE as a success", () => {
    const inactive = definition.statuses.find((item) => item.value === "INACTIVE");
    expect(inactive?.tone).not.toBe("success");
  });

  it("draws the process bar as the five phases", () => {
    expect(definition.process?.stages.map((stage) => stage.key)).toEqual([
      ...PARTNER_PHASES,
    ]);
    // Every status resolves to one of those stages.
    for (const status of PARTNER_STATUS_VALUES)
      expect(PARTNER_PHASES).toContain(partnerPhaseOf(status));
  });

  it.each(["status", "accountStatus", "partnerNumber", "code"])(
    "keeps %s read-only and off the create form",
    (key) => {
      expect(fields.get(key)).toMatchObject({ readOnly: true, hideOnCreate: true });
    },
  );

  it("explains what changes the account status", () => {
    expect(fields.get("accountStatus")?.description).toMatch(/Activate partner/);
  });

  it("offers partnership model as an editable field", () => {
    expect(fields.get("partnershipModel")?.readOnly).toBeFalsy();
  });
});

describe("an edit with nothing to send", () => {
  it("is not reported as saved", () => {
    expect(emptyEditOutcome({}, false)).toEqual({
      success: false,
      message: "No changes to save.",
    });
  });

  it("does not interfere with a real edit or a create", () => {
    expect(emptyEditOutcome({ displayName: "Acme" }, false)).toBeNull();
    expect(emptyEditOutcome({}, true)).toBeNull();
  });
});
