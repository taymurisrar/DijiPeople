import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_RECIPIENTS_PER_ACTION,
  WORKFLOW_LIST_RECIPIENT_MODES,
  buildActionRecipientFields,
  buildRecipientEntries,
  draftsFromAction,
  emptyRecipientDraft,
  validateRecipients,
} from "./workflow-recipients";

const RUNTIME = readFileSync(
  path.resolve(
    __dirname,
    "../../../services/api/src/modules/workflows/workflow-runtime.service.ts",
  ),
  "utf8",
).replace(/\r/g, "");

describe("recipient vocabulary mirrors the API", () => {
  it("has the API's modes plus ROLE, and the same cap", () => {
    const base = /WORKFLOW_RECIPIENT_MODES = \[([\s\S]*?)\] as const/.exec(RUNTIME);
    expect(base).not.toBeNull();
    const modes = [...(base as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g)].map(
      (m) => m[1],
    );
    expect([...WORKFLOW_LIST_RECIPIENT_MODES]).toEqual([...modes, "ROLE"]);
    const cap = /MAX_RECIPIENTS_PER_ACTION = (\d+)/.exec(RUNTIME);
    expect(Number((cap as RegExpExecArray)[1])).toBe(MAX_RECIPIENTS_PER_ACTION);
  });
});

describe("draftsFromAction", () => {
  it("shows a legacy action as one recipient", () => {
    expect(
      draftsFromAction({
        recipients: [],
        recipientMode: "FIXED",
        recipientAddress: "hr@example.com",
      }),
    ).toEqual([{ mode: "FIXED", address: "hr@example.com", roleKey: "" }]);
  });

  it("falls back to the record's person for an unknown legacy mode", () => {
    expect(draftsFromAction({ recipientMode: "???" })[0].mode).toBe("SUBJECT");
  });

  it("shows the stored list when there is one", () => {
    expect(
      draftsFromAction({
        recipients: [
          { mode: "ROLE", roleKey: "hr-manager" },
          { mode: "ACTOR" },
        ],
        recipientMode: "SUBJECT",
      }),
    ).toEqual([
      { mode: "ROLE", address: "", roleKey: "hr-manager" },
      { mode: "ACTOR", address: "", roleKey: "" },
    ]);
  });
});

describe("validateRecipients", () => {
  it("needs a recipient, an address for FIXED and a key for ROLE", () => {
    expect(validateRecipients([])).not.toBeNull();
    expect(validateRecipients([emptyRecipientDraft("FIXED")])).toMatch(/address/);
    expect(validateRecipients([emptyRecipientDraft("ROLE")])).toMatch(/role/);
    expect(validateRecipients([emptyRecipientDraft("SUBJECT")])).toBeNull();
  });

  it("caps the list", () => {
    const many = Array.from({ length: MAX_RECIPIENTS_PER_ACTION + 1 }, () =>
      emptyRecipientDraft("SUBJECT"),
    );
    expect(validateRecipients(many)).not.toBeNull();
  });
});

describe("payload", () => {
  it("sends only the field each mode uses", () => {
    expect(
      buildRecipientEntries([
        { mode: "FIXED", address: " a@b.co ", roleKey: "stale" },
        { mode: "ROLE", address: "stale@b.co", roleKey: " hr " },
        { mode: "ACTOR", address: "x", roleKey: "y" },
      ]),
    ).toEqual([
      { mode: "FIXED", address: "a@b.co" },
      { mode: "ROLE", roleKey: "hr" },
      { mode: "ACTOR" },
    ]);
  });

  it("keeps a legacy single-recipient action in the legacy shape", () => {
    expect(
      buildActionRecipientFields(
        [{ mode: "FIXED", address: " a@b.co ", roleKey: "" }],
        false,
      ),
    ).toEqual({ recipientMode: "FIXED", recipientAddress: "a@b.co" });
    expect(
      buildActionRecipientFields([emptyRecipientDraft("SUBJECT")], false),
    ).toEqual({ recipientMode: "SUBJECT", recipientAddress: null });
  });

  it("sends the list when there are several, a role, or a list was stored", () => {
    expect(
      buildActionRecipientFields(
        [emptyRecipientDraft("SUBJECT"), emptyRecipientDraft("ACTOR")],
        false,
      ),
    ).toEqual({ recipients: [{ mode: "SUBJECT" }, { mode: "ACTOR" }] });
    expect(
      buildActionRecipientFields(
        [{ mode: "ROLE", address: "", roleKey: "hr" }],
        false,
      ),
    ).toEqual({ recipients: [{ mode: "ROLE", roleKey: "hr" }] });
    expect(
      buildActionRecipientFields([emptyRecipientDraft("SUBJECT")], true),
    ).toEqual({ recipients: [{ mode: "SUBJECT" }] });
  });
});
