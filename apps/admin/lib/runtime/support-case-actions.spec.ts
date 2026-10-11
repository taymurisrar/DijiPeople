import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commandMatchesRecord } from "./command-visibility";
import { getPlatformModuleDefinition } from "./platform-module-registry";
import type { RuntimeActionDefinition } from "./platform-runtime.types";
import { executeRuntimeRecordAction } from "./runtime-record-action-handler";
import {
  bindRuntimeLookupPath,
  lookupDependents,
  resolveLookupBindings,
} from "./runtime-lookups";
import {
  SUPPORT_CASE_ACTIONS,
  SUPPORT_CASE_TRANSITIONS,
  isSupportCaseDialogAction,
  supportCaseStatesFor,
} from "./support-case-actions";

/*
 * WS09 / WS11. The support case command bar offers a command only where the
 * API's lifecycle accepts it, every command reaches a support case route (the
 * old panel's Escalate posted a value the API could never accept), and the
 * tenant picker is scoped by the chosen customer.
 */

const CONTRACT = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "../../../../services/api/src/modules/support-cases/support-case-transitions.contract.json",
    ),
    "utf8",
  ),
) as Record<string, unknown>;

const definition = getPlatformModuleDefinition("support-cases")!;
const action = (key: string) =>
  definition.actions.find(
    (item) => item.key === key && item.scope === "record",
  ) as RuntimeActionDefinition;

describe("support case lifecycle commands", () => {
  it("mirror the API transition table exactly", () => {
    const table = Object.fromEntries(
      Object.entries(CONTRACT).filter(([key]) => key !== "$comment"),
    );
    expect(table).toEqual(
      Object.fromEntries(
        Object.entries(SUPPORT_CASE_TRANSITIONS).map(([from, to]) => [
          from,
          [...to],
        ]),
      ),
    );
  });

  it.each([
    ["triage-case", "TRIAGED"],
    ["resolve-case", "RESOLVED"],
    ["close-case", "CLOSED"],
    ["reopen-case", "REOPENED"],
    ["request-info", "WAITING_ON_CUSTOMER"],
    ["cancel-case", "CANCELLED"],
  ])("%s is offered exactly where %s is a legal move", (key, to) => {
    const command = action(key);
    expect(command).toBeDefined();
    expect([...(command.states ?? [])].sort()).toEqual(
      supportCaseStatesFor(to).sort(),
    );
    for (const status of Object.keys(SUPPORT_CASE_TRANSITIONS))
      expect(commandMatchesRecord(command, { status })).toBe(
        SUPPORT_CASE_TRANSITIONS[status]!.includes(to),
      );
  });

  it("offers nothing on a merged case, Edit included", () => {
    const merged = { status: "CLOSED", mergedIntoCaseId: "case-b" };
    for (const command of [...SUPPORT_CASE_ACTIONS, action("edit")])
      expect(commandMatchesRecord(command, merged)).toBe(false);
    expect(
      commandMatchesRecord(action("edit"), { status: "CLOSED" }),
    ).toBe(false);
    expect(
      commandMatchesRecord(action("edit"), { status: "INVESTIGATING" }),
    ).toBe(true);
  });

  it("collects a reason for cancel and reopen, and confirms the destructive ones", () => {
    expect(action("cancel-case").reasonPrompt).toBeDefined();
    expect(action("cancel-case").destructive).toBe(true);
    expect(action("reopen-case").reasonPrompt).toBeDefined();
    expect(action("merge-case").destructive).toBe(true);
    expect(action("merge-case").confirmTitle).toBeTruthy();
  });

  it("never reuses a key the record handler already gives another meaning", () => {
    for (const command of SUPPORT_CASE_ACTIONS)
      expect(["cancel", "assign", "close", "edit", "save"]).not.toContain(
        command.key,
      );
  });
});

describe("support case command routing", () => {
  type Captured = { url: string; method: string; body: unknown };

  async function run(key: string) {
    const captured: Captured[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "rec-1" }),
      } as Response;
    }) as typeof fetch;
    const dialogs: string[] = [];
    const executeRecordAction = jest.fn();
    await executeRuntimeRecordAction({
      action: action(key),
      moduleKey: "support-cases",
      record: { id: "rec-1" } as never,
      values: { status: "INVESTIGATING" },
      routeBase: "/support/cases",
      adapter: { executeRecordAction } as never,
      router: { push: () => undefined },
      save: async () => undefined,
      reloadRecord: async () => undefined,
      resetForm: () => undefined,
      enterEditMode: () => undefined,
      leaveEditMode: () => undefined,
      openSignatureDialog: () => undefined,
      openSupportCaseDialog: (dialog) => dialogs.push(dialog),
      requestReason: async () => "Customer asked for it",
    });
    return { captured, dialogs, executeRecordAction };
  }

  it.each(SUPPORT_CASE_ACTIONS.map((command) => command.key))(
    "%s reaches a support case route or opens its dialog",
    async (key) => {
      const result = await run(key);
      // Never the generic runtime action route, which has no case actions.
      expect(result.executeRecordAction).not.toHaveBeenCalled();
      expect(
        result.captured.every((call) =>
          call.url.startsWith("/api/support-cases/rec-1/"),
        ),
      ).toBe(true);
      if (isSupportCaseDialogAction(key)) {
        expect(result.dialogs).toEqual([key]);
        expect(result.captured).toHaveLength(0);
      } else {
        expect(result.captured).toHaveLength(1);
      }
    },
  );

  it("sends the reason with cancel and reopen", async () => {
    expect((await run("cancel-case")).captured[0]).toEqual({
      url: "/api/support-cases/rec-1/transition",
      method: "POST",
      body: { toStatus: "CANCELLED", reason: "Customer asked for it" },
    });
    expect((await run("reopen-case")).captured[0]).toEqual({
      url: "/api/support-cases/rec-1/reopen",
      method: "POST",
      body: { reason: "Customer asked for it" },
    });
  });
});

describe("support case tenant picker (WS09)", () => {
  const fields = definition.forms.flatMap((form) => form.fields);
  const tenant = fields.find((field) => field.key === "tenantId")!;

  it("is scoped by the chosen customer", () => {
    expect(tenant.lookupPath).toBe(
      "/super-admin/tenants?customerAccountId={customerAccountId?}",
    );
    expect(
      bindRuntimeLookupPath(tenant.lookupPath!, { customerAccountId: "cust-1" }),
    ).toBe("/super-admin/tenants?customerAccountId=cust-1");
  });

  it("still lists every tenant before a customer is chosen", () => {
    expect(resolveLookupBindings(tenant.lookupPath, {})).toEqual({
      customerAccountId: "",
    });
    expect(bindRuntimeLookupPath(tenant.lookupPath!, {})).toBe(
      "/super-admin/tenants?customerAccountId=",
    );
  });

  it("is cleared when the customer changes", () => {
    expect(lookupDependents(fields, "customerAccountId")).toContain("tenantId");
  });

  it("binds the team picker to a real team id", () => {
    const team = fields.find((field) => field.key === "assignedTeamId")!;
    expect(team.lookupPath).toBe("/platform-teams?active=true&category=SUPPORT");
    expect(team.displayValueField).toBe("assignedTeam");
    // The legacy free-text snapshot is display-only, never a second editor.
    const snapshot = fields.find((field) => field.key === "assignedTeam");
    expect(snapshot?.hidden).toBe(true);
    expect(snapshot?.readOnly).toBe(true);
  });
});
