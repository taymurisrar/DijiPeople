import { PARTNER_LIFECYCLE_ACTIONS } from "@repo/config";
import { commandMatchesRecord } from "./command-visibility";
import { getPlatformModuleDefinition } from "./platform-module-registry";

/*
 * A record command's record conditions: `states` and `visibleWhen`
 * (ADR-0026). `visibleWhen` was added so the partner record could offer the
 * application-review commands only to a partner that came from an inquiry; a
 * partner created in the console starts at DRAFT with no inquiry and was
 * offered nothing it could use.
 */

describe("commandMatchesRecord", () => {
  it("passes a command with no record conditions, with or without a record", () => {
    expect(commandMatchesRecord({}, undefined)).toBe(true);
    expect(commandMatchesRecord({}, { status: "ACTIVE" })).toBe(true);
  });

  it("holds a command to its states", () => {
    const action = { states: ["DRAFT", "ACTIVE"] };
    expect(commandMatchesRecord(action, { status: "DRAFT" })).toBe(true);
    expect(commandMatchesRecord(action, { status: "SUSPENDED" })).toBe(false);
    expect(commandMatchesRecord(action, undefined)).toBe(false);
  });

  it("holds a command to visibleWhen equals", () => {
    const action = { visibleWhen: { field: "hasInquiry", equals: true } };
    expect(commandMatchesRecord(action, { hasInquiry: true })).toBe(true);
    expect(commandMatchesRecord(action, { hasInquiry: false })).toBe(false);
    // A record that does not carry the field does not qualify.
    expect(commandMatchesRecord(action, {})).toBe(false);
    expect(commandMatchesRecord(action, undefined)).toBe(false);
  });

  it("supports the in and hasValue forms of the field condition", () => {
    expect(
      commandMatchesRecord(
        { visibleWhen: { field: "type", in: ["COMPANY", "AGENCY"] } },
        { type: "AGENCY" },
      ),
    ).toBe(true);
    expect(
      commandMatchesRecord(
        { visibleWhen: { field: "type", in: ["COMPANY"] } },
        { type: "INDIVIDUAL" },
      ),
    ).toBe(false);
    expect(
      commandMatchesRecord(
        { visibleWhen: { field: "email", hasValue: true } },
        { email: "" },
      ),
    ).toBe(false);
    expect(
      commandMatchesRecord(
        { visibleWhen: { field: "email", hasValue: false } },
        {},
      ),
    ).toBe(true);
  });

  it("requires both states and visibleWhen when a command declares both", () => {
    const action = {
      states: ["NEW_INQUIRY"],
      visibleWhen: { field: "hasInquiry", equals: true },
    };
    expect(
      commandMatchesRecord(action, { status: "NEW_INQUIRY", hasInquiry: true }),
    ).toBe(true);
    expect(
      commandMatchesRecord(action, { status: "NEW_INQUIRY", hasInquiry: false }),
    ).toBe(false);
    expect(
      commandMatchesRecord(action, { status: "DRAFT", hasInquiry: true }),
    ).toBe(false);
  });
});

describe("partner commands across the two entry paths", () => {
  const actions = getPlatformModuleDefinition("partners").actions;
  const command = (key: string) => {
    const found = actions.find((action) => action.key === key);
    if (!found) throw new Error(`partners has no ${key} command`);
    return found;
  };
  const offered = (record: Record<string, unknown>) =>
    actions
      .filter((action) => action.scope !== "list")
      .filter((action) => commandMatchesRecord(action, record))
      .map((action) => action.key);

  const REVIEW_COMMANDS = Object.values(PARTNER_LIFECYCLE_ACTIONS)
    .filter((rule) => rule.requiresInquiry)
    .map((rule) => rule.admin)
    .sort();

  it("knows the four application-review commands", () => {
    expect(REVIEW_COMMANDS).toEqual([
      "approve-partner",
      "reject-partner",
      "request-information",
      "start-review",
    ]);
  });

  it.each(REVIEW_COMMANDS)(
    "%s is offered only to a partner that came from an inquiry",
    (key) => {
      expect(command(key).visibleWhen).toEqual({
        field: "hasInquiry",
        equals: true,
      });
    },
  );

  it("gives no other command an inquiry condition", () => {
    for (const action of actions)
      if (!REVIEW_COMMANDS.includes(action.key))
        expect(action.visibleWhen).toBeUndefined();
  });

  it("offers a console-created DRAFT partner Create agreement and Delete, and no review", () => {
    const keys = offered({ status: "DRAFT", hasInquiry: false });
    expect(keys).toEqual(expect.arrayContaining(["create-agreement", "delete"]));
    for (const key of REVIEW_COMMANDS) expect(keys).not.toContain(key);
  });

  it("still offers an inquiry partner its review commands", () => {
    const keys = offered({ status: "NEW_INQUIRY", hasInquiry: true });
    expect(keys).toEqual(
      expect.arrayContaining([
        "start-review",
        "approve-partner",
        "reject-partner",
        "request-information",
      ]),
    );
  });

  it("hides the review commands from a console partner in any status", () => {
    const keys = offered({ status: "NEW_INQUIRY", hasInquiry: false });
    for (const key of REVIEW_COMMANDS) expect(keys).not.toContain(key);
  });

  it("offers Create agreement from DRAFT and before signing, not after it", () => {
    const states = command("create-agreement").states ?? [];
    for (const status of [
      "DRAFT",
      "APPROVED_AWAITING_AGREEMENT",
      "AGREEMENT_IN_PROGRESS",
      "ACTIVE",
    ])
      expect(states).toContain(status);
    for (const status of [
      "NEW_INQUIRY",
      "UNDER_REVIEW",
      "AGREEMENT_EXECUTED",
      "INFORMATION_APPROVED",
      "REJECTED",
    ])
      expect(states).not.toContain(status);
  });
});
