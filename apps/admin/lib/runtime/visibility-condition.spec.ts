import { matchesVisibility, readConditionValue } from "./visibility-condition";

/*
 * The one matcher behind form-field and command visibility. `runtime-form.tsx`
 * used to keep a private copy that read dot paths while this one did not; the
 * form now imports this, so the dot-path reading lives here.
 */
describe("matchesVisibility", () => {
  it("reads a flat key first, then a dot path into a nested object", () => {
    expect(readConditionValue({ "owner.id": "flat" }, "owner.id")).toBe("flat");
    expect(readConditionValue({ owner: { id: "u1" } }, "owner.id")).toBe("u1");
    expect(readConditionValue({ owner: null }, "owner.id")).toBeUndefined();
    expect(readConditionValue({ owner: ["x"] }, "owner.0")).toBeUndefined();
  });

  it("applies hasValue before in, and in before equals", () => {
    const values = { status: "ACTIVE", note: "", owner: { id: "u1" } };
    expect(matchesVisibility({ field: "note", hasValue: false }, values)).toBe(
      true,
    );
    expect(
      matchesVisibility({ field: "owner.id", hasValue: true }, values),
    ).toBe(true);
    expect(
      matchesVisibility(
        { field: "status", in: ["ACTIVE"], equals: "DRAFT" },
        values,
      ),
    ).toBe(true);
    expect(matchesVisibility({ field: "status", equals: "DRAFT" }, values)).toBe(
      false,
    );
    expect(matchesVisibility({ field: "missing", equals: true }, values)).toBe(
      false,
    );
  });
});
