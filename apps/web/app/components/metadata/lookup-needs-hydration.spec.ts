import { lookupNeedsHydration } from "./runtime-metadata-form-renderer";

describe("lookupNeedsHydration (DP-QA-034)", () => {
  it("always hydrates while editing", () => {
    expect(
      lookupNeedsHydration({ mode: "edit", value: "", displayValue: "" }),
    ).toBe(true);
    expect(
      lookupNeedsHydration({ mode: "create", value: "x", displayValue: "X" }),
    ).toBe(true);
  });

  it("does not fetch an option list for an empty read-only field", () => {
    for (const value of ["", "  ", null, undefined]) {
      expect(
        lookupNeedsHydration({ mode: "detail", value, displayValue: "" }),
      ).toBe(false);
    }
  });

  it("does not fetch when the name is already known", () => {
    expect(
      lookupNeedsHydration({
        mode: "detail",
        value: "id-1",
        displayValue: "Doha",
      }),
    ).toBe(false);
  });

  it("fetches only to name a stored id that has no display value", () => {
    expect(
      lookupNeedsHydration({ mode: "detail", value: "id-1", displayValue: "" }),
    ).toBe(true);
  });
});
