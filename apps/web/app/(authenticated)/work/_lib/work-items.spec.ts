import { readFileSync } from "node:fs";
import path from "node:path";
import {
  WORK_ITEM_STATUSES,
  WORK_ITEM_TRANSITIONS,
  allowedTransitions,
  buildCreateQueuePayload,
  buildCreateTaskPayload,
  buildItemsQuery,
  buildReassignPayload,
  buildTransitionPayload,
  isTerminal,
  isValidQueueKey,
  messageFromErrorBody,
  priorityTone,
  queueKeyFromName,
  slaBadge,
  statusTone,
} from "./work-items";

describe("allowedTransitions", () => {
  it("offers only the moves the lifecycle allows", () => {
    expect(allowedTransitions("OPEN").map((a) => a.to)).toEqual([
      "IN_PROGRESS",
      "CANCELLED",
    ]);
    expect(allowedTransitions("IN_REVIEW").map((a) => a.to)).toEqual([
      "IN_PROGRESS",
      "DONE",
    ]);
  });

  it("names the moves the way people say them", () => {
    const labels = Object.fromEntries(
      allowedTransitions("IN_PROGRESS").map((a) => [a.to, a.label]),
    );
    expect(labels).toMatchObject({
      BLOCKED: "Block",
      IN_REVIEW: "Send to review",
      DONE: "Done",
      CANCELLED: "Cancel",
    });
    expect(allowedTransitions("OPEN")[0].label).toBe("Start");
  });

  it("calls leaving a finished status a reopen", () => {
    expect(allowedTransitions("DONE").map((a) => a.label)).toEqual(["Reopen"]);
    expect(allowedTransitions("CANCELLED").map((a) => a.label)).toEqual([
      "Reopen",
    ]);
  });

  it("covers every status", () => {
    for (const status of WORK_ITEM_STATUSES) {
      expect(WORK_ITEM_TRANSITIONS[status]).toBeDefined();
    }
    expect(isTerminal("DONE")).toBe(true);
    expect(isTerminal("BLOCKED")).toBe(false);
  });

  it("stays identical to the API lifecycle table", () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../../services/api/src/modules/work-items/work-item-lifecycle.ts",
      ),
      "utf8",
    ).replace(/\r/g, "");
    const block = /WORK_ITEM_TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
    expect(block).not.toBeNull();
    const parsed: Record<string, string[]> = {};
    for (const line of (block as RegExpExecArray)[1].split("\n")) {
      const match = /^\s*([A-Z_]+):\s*\[([^\]]*)\]/.exec(line);
      if (match) {
        parsed[match[1]] = match[2]
          .split(",")
          .map((s) => s.trim().replace(/'/g, ""))
          .filter(Boolean);
      }
    }
    expect(parsed).toEqual(
      Object.fromEntries(
        Object.entries(WORK_ITEM_TRANSITIONS).map(([k, v]) => [k, [...v]]),
      ),
    );
  });
});

describe("badges", () => {
  it("maps every SLA state to text and a tone", () => {
    expect(slaBadge("BREACHED")).toEqual({ label: "Breached", tone: "danger" });
    expect(slaBadge("AT_RISK")).toEqual({ label: "At risk", tone: "warning" });
    expect(slaBadge("MET")).toEqual({ label: "Met", tone: "good" });
    expect(slaBadge("ON_TRACK").label).toBe("On track");
    expect(slaBadge("NONE")).toEqual({ label: "No SLA", tone: "muted" });
  });

  it("treats a missing or unknown standing as no SLA", () => {
    expect(slaBadge(undefined).label).toBe("No SLA");
    expect(slaBadge("WEIRD" as never).label).toBe("No SLA");
  });

  it("tones status and priority", () => {
    expect(statusTone("DONE")).toBe("good");
    expect(statusTone("BLOCKED")).toBe("danger");
    expect(priorityTone("URGENT")).toBe("danger");
    expect(priorityTone("NORMAL")).toBe("muted");
  });
});

describe("payload builders", () => {
  it("builds a personal task with only the fields the API accepts", () => {
    expect(buildCreateTaskPayload({ title: "  Call back  " })).toEqual({
      kind: "TASK",
      title: "Call back",
    });
    expect(
      buildCreateTaskPayload({
        title: "x",
        priority: "HIGH",
        dueDate: "2026-12-01",
      }),
    ).toEqual({
      kind: "TASK",
      title: "x",
      priority: "HIGH",
      dueAt: "2026-12-01T00:00:00.000Z",
    });
    expect(buildCreateTaskPayload({ title: "x", priority: "" })).not.toHaveProperty(
      "priority",
    );
  });

  it("sends exactly { to } for a transition", () => {
    expect(buildTransitionPayload("DONE")).toEqual({ to: "DONE" });
  });

  it("omits a blank reassign reason", () => {
    expect(buildReassignPayload({ ownerEmployeeId: "e1", reason: "  " })).toEqual({
      ownerEmployeeId: "e1",
    });
    expect(
      buildReassignPayload({ ownerEmployeeId: "e1", reason: " cover " }),
    ).toEqual({ ownerEmployeeId: "e1", reason: "cover" });
  });

  it("builds a queue with optional SLA minutes only when set", () => {
    expect(
      buildCreateQueuePayload({
        key: "help-desk",
        name: " Help desk ",
        responseSlaMinutes: null,
        resolutionSlaMinutes: 480,
      }),
    ).toEqual({ key: "help-desk", name: "Help desk", resolutionSlaMinutes: 480 });
  });

  it("derives a key the API accepts", () => {
    expect(queueKeyFromName("HR Help Desk!")).toBe("hr-help-desk");
    expect(isValidQueueKey("hr-help-desk")).toBe(true);
    expect(isValidQueueKey("A")).toBe(false);
    expect(isValidQueueKey("-bad")).toBe(false);
  });

  it("builds list queries", () => {
    expect(buildItemsQuery({ mine: true })).toBe("mine=true&take=100");
    expect(
      buildItemsQuery({ queueId: "q1", unassigned: true, overdue: true }),
    ).toBe("queueId=q1&unassigned=true&overdue=true&take=100");
  });
});

describe("messageFromErrorBody", () => {
  it("surfaces the API message", () => {
    expect(messageFromErrorBody({ message: "Nope" }, "fb")).toBe("Nope");
    expect(messageFromErrorBody({ message: ["a", "b"] }, "fb")).toBe("a b");
    expect(messageFromErrorBody(null, "fb")).toBe("fb");
  });
});
