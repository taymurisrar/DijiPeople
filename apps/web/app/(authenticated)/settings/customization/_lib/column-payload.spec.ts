import {
  buildColumnPayload,
  supportsMaxLength,
  type ColumnPayloadInput,
} from "./column-payload";

/*
 * BUG-3492 — the client half of the seam. The server half, which sends these
 * same payloads through the real DTO validation and createColumn, lives in
 * services/api/src/modules/customization/column-payload.seam.spec.ts.
 */
function input(patch: Partial<ColumnPayloadInput>): ColumnPayloadInput {
  return {
    mode: "create",
    columnKey: "dd_condition",
    displayName: "Condition",
    fieldType: "text",
    isRequired: false,
    isVisible: true,
    isSearchable: false,
    isFilterable: false,
    isSortable: false,
    maxLength: null,
    defaultValue: "",
    lookupTargetTableKey: "",
    options: [],
    sortOrder: 10,
    ...patch,
  };
}

describe("buildColumnPayload", () => {
  it("omits maxLength for a field type that has no length", () => {
    for (const fieldType of [
      "choice",
      "reference",
      "number",
      "date",
      "datetime",
      "boolean",
    ]) {
      const payload = buildColumnPayload(input({ fieldType, maxLength: 50 }));
      expect(payload).not.toHaveProperty("maxLength");
    }
  });

  it("omits maxLength for a text field whose length is blank", () => {
    expect(buildColumnPayload(input({ maxLength: null }))).not.toHaveProperty(
      "maxLength",
    );
  });

  it("keeps a typed length on a text field", () => {
    expect(buildColumnPayload(input({ maxLength: 40 }))).toMatchObject({
      maxLength: 40,
    });
  });

  it("sends the lookup target only for a reference field", () => {
    expect(
      buildColumnPayload(
        input({ fieldType: "reference", lookupTargetTableKey: "employees" }),
      ),
    ).toMatchObject({ fieldType: "lookup", lookupTargetTableKey: "employees" });
    expect(
      buildColumnPayload(input({ lookupTargetTableKey: "employees" })),
    ).not.toHaveProperty("lookupTargetTableKey");
  });

  it("never sends null for an optional field", () => {
    const payload = buildColumnPayload(input({ fieldType: "choice" }));
    expect(Object.values(payload)).not.toContain(null);
  });

  it("knows which field types carry a length", () => {
    expect(supportsMaxLength("text")).toBe(true);
    expect(supportsMaxLength("choice")).toBe(false);
  });
});
