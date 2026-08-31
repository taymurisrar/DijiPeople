/*
 * The approvals inbox as a command surface.
 *
 * Approve and Reject were `disabledBusinessCommand` stubs — `isDisabled: true`
 * in the spec, so greyed out on every row for every caller, with the reason
 * "not wired to a generic ModuleDataAdapter handler yet". There was no handler,
 * no API route and no POST export on the proxy, so a screen whose entire job is
 * deciding things could not decide anything.
 *
 * These assert the wiring end to end on the client side: the commands are live,
 * each takes its enabled state from the record rather than the spec, and the
 * handler posts where the API actually listens. The equivalent server-side
 * assertions are in `approvals.decision.spec.ts`.
 */
import { buildApprovalRecord } from "@/app/components/approvals/approval-record";
import type { ApprovalRequestItem } from "@/app/components/approvals/approval-types";
import { getCommandPayloadSchema } from "../command-payload-schema";
import { createStandardModuleDataAdapter } from "./standard-module-data.adapter";
import { approvalRuntimeSpec } from "./standard-module-specs";

const APPROVAL_ID = "2381aba5-60ed-4cbb-9fb6-3d5040fb81e5";

function commandFor(key: string) {
  const command = approvalRuntimeSpec.commands?.find(
    (candidate) => candidate.key === key,
  );
  if (!command) throw new Error(`No ${key} command on the approvals spec.`);
  return command;
}

describe("approvals runtime spec", () => {
  it.each([
    ["approval.approve", "canApprove"],
    ["approval.reject", "canReject"],
    ["approval.cancel", "canCancel"],
  ])("declares %s as live, not a disabled stub", (key, capabilityField) => {
    const command = commandFor(key);

    // The exact shape of the old defect: a spec-level `isDisabled: true` cannot
    // be turned on by any record, so the button was dead for everyone.
    expect(command.isDisabled).not.toBe(true);
    expect(command.dynamicDisabled).toEqual({
      fieldLogicalName: capabilityField,
      enabledValue: true,
      reasonFieldLogicalName: "decisionReason",
      fallbackReason: expect.any(String),
    });
  });

  it("asks for a reason when rejecting and not when approving", () => {
    const reject = getCommandPayloadSchema(
      commandFor("approval.reject").payloadSchemaKey,
    );
    const approve = getCommandPayloadSchema(
      commandFor("approval.approve").payloadSchemaKey,
    );

    expect(reject?.fields).toEqual([
      expect.objectContaining({ key: "comment", required: true }),
    ]);
    expect(approve?.fields[0]?.required).toBeFalsy();
  });

  it("offers neither create nor edit for a record raised elsewhere", () => {
    // An approval is a projection of another module's record. Edit and Save had
    // no writable field and no endpoint behind them.
    expect(approvalRuntimeSpec.adapterCapabilities?.disableCreate).toBe(true);
    expect(approvalRuntimeSpec.adapterCapabilities?.disableEdit).toBe(true);
    expect(approvalRuntimeSpec.adapterCapabilities?.disableSave).toBe(true);
  });
});

describe("approvals decision handlers", () => {
  const originalFetch = global.fetch;
  let captured: { url: string; method?: string; body: unknown } | null = null;

  beforeEach(() => {
    captured = null;
    global.fetch = (async (url: string, init?: RequestInit) => {
      captured = {
        url: String(url),
        method: init?.method,
        body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({ item: { id: APPROVAL_ID } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function runHandler(key: string, payload?: Record<string, unknown>) {
    const adapter = createStandardModuleDataAdapter(approvalRuntimeSpec);
    const handler = adapter.commandHandlers?.[key];
    if (!handler) throw new Error(`No handler registered for ${key}.`);
    return handler({
      recordId: APPROVAL_ID,
      payload,
      runtime: { cacheKeys: [] },
    } as unknown as Parameters<typeof handler>[0]);
  }

  it.each([
    ["approval.approve", "approve"],
    ["approval.reject", "reject"],
    ["approval.cancel", "cancel"],
  ])("posts %s to the approvals API", async (key, path) => {
    await runHandler(key, { comment: "Approved after checking cover" });

    expect(captured).not.toBeNull();
    expect(captured!.method).toBe("POST");
    expect(captured!.url).toBe(`/api/approvals/${APPROVAL_ID}/${path}`);
    expect(captured!.body).toEqual({
      comment: "Approved after checking cover",
    });
  });

  it("omits a blank comment rather than sending an empty string", async () => {
    // `ApprovalDecisionDto.comment` is bounded and optional; "" is not a
    // comment, and the transform that would strip it lives server-side.
    await runHandler("approval.approve", { comment: "   " });

    expect(captured!.body).toEqual({});
  });

  it("refuses to post without a record id", async () => {
    const adapter = createStandardModuleDataAdapter(approvalRuntimeSpec);
    const handler = adapter.commandHandlers!["approval.approve"]!;

    const result = await handler({
      recordId: "",
      runtime: { cacheKeys: [] },
    } as unknown as Parameters<typeof handler>[0]);

    expect(result.ok).toBe(false);
    expect(captured).toBeNull();
  });
});

/*
 * The seam between the two halves.
 *
 * `dynamicDisabled` names a single field by logical name and reads it straight
 * off the record. Nothing type-checks that name against what the pages actually
 * put there — a spread into a `record={{...}}` prop satisfies no contract — so
 * renaming `canApprove` on either side would leave every button permanently
 * disabled with no compiler error and no failing test. That is BUG-2718's own
 * symptom, reached from the other direction, and it is exactly the kind of gap
 * that a fix wired correctly at both ends still leaves open in the middle.
 */
describe("the capability fields the spec reads are the ones the pages write", () => {
  const approval = {
    id: "2381aba5-60ed-4cbb-9fb6-3d5040fb81e5",
    moduleKey: "attendance",
    title: "ACR-000001 - Taimur Israr",
    requestNumber: "ACR-000001",
    submittedAtUtc: "2026-08-30T08:00:00.000Z",
    submittedByUser: { firstName: "Taimur", lastName: "Israr", email: "t@x.io" },
    submittedForEmployee: null,
    currentStep: {
      assignments: [
        {
          assignedToUser: { firstName: "Ayesha", lastName: "Khan" },
          assignedToRole: null,
        },
      ],
    },
    decision: {
      canApprove: true,
      canReject: false,
      canCancel: false,
      reason: "This step is assigned to someone else.",
    },
  } as unknown as ApprovalRequestItem;

  it("puts every field the commands key off onto the record", () => {
    const record = buildApprovalRecord(approval) as Record<string, unknown>;

    for (const command of approvalRuntimeSpec.commands ?? []) {
      const config = command.dynamicDisabled;
      if (!config) continue;
      expect(Object.keys(record)).toContain(config.fieldLogicalName);
      expect(Object.keys(record)).toContain(config.reasonFieldLogicalName);
    }
  });

  it("enables exactly the commands the server said were available", () => {
    const record = buildApprovalRecord(approval) as Record<string, unknown>;

    // The command bar treats a field equal to `enabledValue` as enabled.
    expect(record.canApprove).toBe(true);
    expect(record.canReject).toBe(false);
    expect(record.canCancel).toBe(false);
    expect(record.decisionReason).toBe(
      "This step is assigned to someone else.",
    );
  });

  it("renders the module as a name rather than a machine key", () => {
    const record = buildApprovalRecord(approval) as Record<string, unknown>;

    // The Module column read "attendance" beside title-cased everything else.
    expect(record.moduleLabel).toBe("Attendance");
  });

  it("names the assignees rather than leaving Assigned To empty", () => {
    const record = buildApprovalRecord(approval) as Record<string, unknown>;

    expect(record.assignedToName).toBe("Ayesha Khan");
    expect(record.requesterName).toBe("Taimur Israr");
  });
});
