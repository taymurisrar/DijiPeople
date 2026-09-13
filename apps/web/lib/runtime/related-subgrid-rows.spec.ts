import { timestampFieldFor, visibleRowActions } from "./related-subgrid-rows";

const MAKE_PRIMARY = {
  key: "setPrimary",
  label: "Make primary",
  hiddenWhenFieldTrue: "isPrimary",
  permissions: "attendanceDevices.manage",
};

describe("related subgrid row actions (ITEM-0179)", () => {
  const canManage = () => true;

  it("offers Make primary on a site that is not primary", () => {
    expect(
      visibleRowActions([MAKE_PRIMARY], { isPrimary: false }, canManage),
    ).toEqual([MAKE_PRIMARY]);
  });

  it("does not offer Make primary on the primary site", () => {
    expect(
      visibleRowActions([MAKE_PRIMARY], { isPrimary: true }, canManage),
    ).toEqual([]);
  });

  it("hides the action from a viewer without its permission", () => {
    const granted: string[] = ["attendanceDevices.read"];
    expect(
      visibleRowActions([MAKE_PRIMARY], { isPrimary: false }, (permissions) =>
        typeof permissions === "string" ? granted.includes(permissions) : true,
      ),
    ).toEqual([]);
  });

  it("is empty when nothing is declared", () => {
    expect(visibleRowActions(undefined, {}, canManage)).toEqual([]);
  });
});

describe("timestamp cells without field metadata (ITEM-0184)", () => {
  it("treats a serialised timestamp as a date-time", () => {
    expect(
      timestampFieldFor("assignedOn", "2026-09-12T22:36:04.512Z")?.dataType,
    ).toBe("datetime");
  });

  it("leaves ordinary text alone, whatever the column is called", () => {
    expect(timestampFieldFor("location", "Head Office")).toBeUndefined();
    expect(timestampFieldFor("assignedOn", "2026-09-12")).toBeUndefined();
    expect(timestampFieldFor("assignedOn", 42)).toBeUndefined();
  });
});
