import {
  BOARD_COLUMNS,
  barWidth,
  buildContributorPayload,
  buildCreateMilestonePayload,
  buildDependencyPayload,
  buildProjectItemsQuery,
  buildProjectTaskPayload,
  buildSetMilestonePayload,
  buildWorkloadQuery,
  defaultWorkloadPeriod,
  formatMinutes,
  groupByColumn,
  loadLabel,
  loadTone,
  parseMinutes,
  percentDoneLabel,
  validateWorkloadPeriod,
} from "./project-work";
import { allowedTransitions, type WorkItem } from "./work-items";

function item(id: string, status: WorkItem["status"]): WorkItem {
  return {
    id,
    kind: "TASK",
    title: id,
    status,
    priority: "NORMAL",
    ownerEmployeeId: null,
    queueId: null,
    dueAt: null,
    resolutionDueAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    sla: { response: "NONE", resolution: "NONE" },
  };
}

describe("board", () => {
  it("has the five agreed columns in order", () => {
    expect([...BOARD_COLUMNS]).toEqual([
      "OPEN",
      "IN_PROGRESS",
      "BLOCKED",
      "IN_REVIEW",
      "DONE",
    ]);
  });

  it("groups items by column and leaves cancelled work off the board", () => {
    const grouped = groupByColumn([
      item("a", "OPEN"),
      item("b", "DONE"),
      item("c", "CANCELLED"),
      item("d", "OPEN"),
    ]);
    expect(grouped.OPEN.map((i) => i.id)).toEqual(["a", "d"]);
    expect(grouped.DONE.map((i) => i.id)).toEqual(["b"]);
    expect(Object.values(grouped).flat()).toHaveLength(3);
  });

  it("offers a card only the moves the lifecycle allows", () => {
    expect(allowedTransitions("BLOCKED").map((a) => a.to)).toEqual([
      "IN_PROGRESS",
      "CANCELLED",
    ]);
  });
});

describe("progress and workload wording", () => {
  it("says there is no work rather than 0 percent", () => {
    expect(percentDoneLabel(null)).toBe("No work yet");
    expect(percentDoneLabel(0)).toBe("0%");
    expect(percentDoneLabel(40)).toBe("40%");
  });

  it("formats minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(null)).toBe("Not set");
  });

  it("reads a load figure and its tone", () => {
    expect(loadLabel(null)).toBe("No capacity");
    expect(loadLabel(75)).toBe("75%");
    expect(loadTone(120)).toBe("danger");
    expect(loadTone(90)).toBe("warning");
    expect(loadTone(40)).toBe("good");
    expect(loadTone(null)).toBe("muted");
  });

  it("clamps a bar", () => {
    expect(barWidth(null)).toBe(0);
    expect(barWidth(140)).toBe(100);
    expect(barWidth(-3)).toBe(0);
    expect(barWidth(55)).toBe(55);
  });
});

describe("workload query", () => {
  it("sends a half-open period that includes the chosen last day", () => {
    const query = new URLSearchParams(
      buildWorkloadQuery({
        from: "2026-12-01",
        to: "2026-12-07",
        projectId: "p1",
      }),
    );
    expect(query.get("from")).toBe("2026-12-01T00:00:00.000Z");
    expect(query.get("to")).toBe("2026-12-08T00:00:00.000Z");
    expect(query.get("projectId")).toBe("p1");
  });

  it("rejects a backwards or empty period", () => {
    expect(validateWorkloadPeriod({ from: "", to: "2026-12-01" })).not.toBeNull();
    expect(
      validateWorkloadPeriod({ from: "2026-12-05", to: "2026-12-01" }),
    ).not.toBeNull();
    expect(
      validateWorkloadPeriod({ from: "2026-12-01", to: "2026-12-01" }),
    ).toBeNull();
  });

  it("defaults to four weeks", () => {
    const period = defaultWorkloadPeriod(new Date(2026, 11, 1));
    expect(period.from).toBe("2026-12-01");
    expect(period.to).toBe("2026-12-28");
  });
});

describe("request bodies", () => {
  it("lists a project's tasks", () => {
    expect(buildProjectItemsQuery({ projectId: "p1" })).toBe(
      "projectId=p1&kind=TASK&take=100",
    );
  });

  it("creates a milestone with only the fields the API accepts", () => {
    expect(
      buildCreateMilestonePayload({ title: " Beta ", projectId: "p1" }),
    ).toEqual({ kind: "MILESTONE", title: "Beta", projectId: "p1" });
    expect(
      buildCreateMilestonePayload({
        title: "Beta",
        projectId: "p1",
        dueDate: "2026-12-31",
      }),
    ).toMatchObject({ dueAt: "2026-12-31T00:00:00.000Z" });
  });

  it("creates a task or subtask", () => {
    expect(
      buildProjectTaskPayload({
        title: "x",
        projectId: "p1",
        milestoneId: "m1",
        parentId: "t1",
      }),
    ).toEqual({
      kind: "TASK",
      title: "x",
      projectId: "p1",
      milestoneId: "m1",
      parentId: "t1",
    });
  });

  it("assigns a milestone by id and clears it with an empty body", () => {
    expect(buildSetMilestonePayload("m1")).toEqual({ milestoneId: "m1" });
    expect(buildSetMilestonePayload("")).toEqual({});
  });

  it("names the dependency", () => {
    expect(buildDependencyPayload("t2")).toEqual({ dependsOnId: "t2" });
  });

  it("parses minutes strictly", () => {
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes(" 90 ")).toBe(90);
    expect(parseMinutes("1.5")).toBe("invalid");
    expect(parseMinutes("-3")).toBe("invalid");
  });

  it("sends only the contributor figures that were entered", () => {
    expect(buildContributorPayload({ estimate: "120", actual: "" })).toEqual({
      ok: true,
      body: { estimateMinutes: 120 },
    });
    expect(buildContributorPayload({ estimate: "", actual: "0" })).toEqual({
      ok: true,
      body: { actualMinutes: 0 },
    });
    expect(buildContributorPayload({ estimate: "", actual: "" }).ok).toBe(false);
    expect(buildContributorPayload({ estimate: "x", actual: "" }).ok).toBe(false);
  });
});
