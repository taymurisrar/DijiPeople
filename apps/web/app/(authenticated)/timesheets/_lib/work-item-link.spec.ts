import {
  FREE_TEXT_TASK,
  applyPickerChoice,
  buildMyWorkItemsQuery,
  isWorkItemLinkError,
  pickerItems,
  pickerValue,
  taskDisplay,
  taskIdForPayload,
  taskMode,
  type LinkableWorkItem,
} from "./work-item-link";

const item = (patch: Partial<LinkableWorkItem>): LinkableWorkItem => ({
  id: "i1",
  title: "Item",
  status: "OPEN",
  ...patch,
});

describe("timesheet work-item picker", () => {
  it("asks only for the person's own items", () => {
    expect(buildMyWorkItemsQuery()).toBe("mine=true&take=100");
  });

  it("offers open, unarchived items by title and keeps the saved link even if closed", () => {
    const items = [
      item({ id: "b", title: "Beta" }),
      item({ id: "a", title: "Alpha", status: "IN_PROGRESS" }),
      item({ id: "d", title: "Done one", status: "DONE" }),
      item({ id: "x", title: "Cancelled", status: "CANCELLED" }),
      item({ id: "z", title: "Archived", archivedAt: "2027-01-01" }),
    ];
    expect(pickerItems(items).map((i) => i.id)).toEqual(["a", "b"]);
    expect(pickerItems(items, "d").map((i) => i.id)).toEqual(["a", "b", "d"]);
    expect(pickerItems(items, "z").map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("reads an entry as none, a linked item, or free text", () => {
    const items = [item({ id: "w1", title: "Fix till" })];
    expect(taskMode({ taskId: null }, items)).toBe("none");
    expect(taskMode({ taskId: "  " }, items)).toBe("none");
    expect(taskMode({ taskId: "w1" }, items)).toBe("item");
    expect(taskMode({ taskId: " w1 " }, items)).toBe("item");
    expect(taskMode({ taskId: "JIRA-12" }, items)).toBe("text");
    expect(taskMode({ taskId: null, freeTask: true }, items)).toBe("text");
    expect(pickerValue({ taskId: "w1" }, items)).toBe("w1");
    expect(pickerValue({ taskId: "JIRA-12" }, items)).toBe(FREE_TEXT_TASK);
    expect(pickerValue({ taskId: null }, items)).toBe("");
  });

  it("turns a picker choice into the entry fields", () => {
    expect(applyPickerChoice("w1")).toEqual({ taskId: "w1", freeTask: false });
    expect(applyPickerChoice("")).toEqual({ taskId: null, freeTask: false });
    expect(applyPickerChoice(FREE_TEXT_TASK)).toEqual({
      taskId: null,
      freeTask: true,
    });
  });

  it("sends a trimmed taskId within the API limit, or null", () => {
    expect(taskIdForPayload(" w1 ")).toBe("w1");
    expect(taskIdForPayload("")).toBeNull();
    expect(taskIdForPayload(undefined)).toBeNull();
    expect(taskIdForPayload("x".repeat(200))).toHaveLength(80);
  });

  it("shows the item title for a link and the text as typed for free text", () => {
    const items = [item({ id: "w1", title: "Fix till" })];
    expect(taskDisplay("w1", items)).toBe("Fix till");
    expect(taskDisplay("JIRA-12", items)).toBe("JIRA-12");
    expect(taskDisplay(null, items)).toBe("No work item");
  });

  it("recognises only the work-item link refusals", () => {
    expect(isWorkItemLinkError("TIMESHEET_WORK_ITEM_NOT_YOURS")).toBe(true);
    expect(isWorkItemLinkError("TIMESHEET_WORK_ITEM_PROJECT")).toBe(true);
    expect(isWorkItemLinkError("TIMESHEET_WEEK_LOCKED")).toBe(false);
    expect(isWorkItemLinkError(undefined)).toBe(false);
    // a 400 reaches the browser as VALIDATION_FAILED: the wording identifies it
    expect(
      isWorkItemLinkError(
        "VALIDATION_FAILED",
        "Time can only be booked to a work item you own or share, and that is not archived.",
      ),
    ).toBe(true);
    expect(
      isWorkItemLinkError(
        "VALIDATION_FAILED",
        "The work item belongs to a different project than the entry.",
      ),
    ).toBe(true);
    expect(isWorkItemLinkError("VALIDATION_FAILED", "Hours must be 0.25-24.")).toBe(
      false,
    );
  });
});
