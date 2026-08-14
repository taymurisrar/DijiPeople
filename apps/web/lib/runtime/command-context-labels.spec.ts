import { commandContextSubtitle } from "./command-context-labels";

/**
 * A work site must never be presented as a shift.
 *
 * The check-in drawer showed "Shift: Karachi Office". The value came from
 * `resolvedShift.name`, which is always a ShiftTemplate — so no work-site name
 * could reach it, and the tenant simply had a shift template named after a
 * place. Nothing enforced the labelling, though, so these lock it down.
 */

describe("command context subtitle", () => {
  it("labels a shift as a shift", () => {
    expect(commandContextSubtitle({ shiftName: "Morning Shift" })).toBe(
      "Shift: Morning Shift",
    );
  });

  it("labels a work site as a work site", () => {
    expect(commandContextSubtitle({ workSiteName: "Karachi Office" })).toBe(
      "Work Site: Karachi Office",
    );
  });

  it("prefers the shift when both are known", () => {
    expect(
      commandContextSubtitle({
        shiftName: "Morning Shift",
        workSiteName: "Karachi Office",
      }),
    ).toBe("Shift: Morning Shift");
  });

  it("never calls a work site a shift", () => {
    const subtitle = commandContextSubtitle({
      shiftName: null,
      workSiteName: "Karachi Office",
    });
    expect(subtitle.startsWith("Shift:")).toBe(false);
  });

  it("renders nothing rather than an empty label", () => {
    expect(commandContextSubtitle({})).toBe("");
    expect(commandContextSubtitle({ shiftName: "  ", workSiteName: "" })).toBe("");
  });
});
