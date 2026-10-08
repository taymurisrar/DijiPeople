import { isEmptyFieldValue, isRuntimeFieldVisible } from "./field-visibility";

describe("empty application details in runtime forms", () => {
  const field = {
    key: "applicationSnapshot",
    hideWhenEmpty: true,
    readOnly: true,
  };

  it.each([undefined, null, "", "  ", {}, []])(
    "hides empty read-only data: %p",
    (value) => {
      expect(isEmptyFieldValue(value)).toBe(true);
      for (const mode of ["read", "edit"] as const)
        expect(
          isRuntimeFieldVisible(field, { applicationSnapshot: value }, mode),
        ).toBe(false);
    },
  );

  it.each([0, false, "submitted", { name: "Partner" }, ["file"]])(
    "retains meaningful data: %p",
    (value) => {
      expect(isEmptyFieldValue(value)).toBe(false);
      expect(
        isRuntimeFieldVisible(field, { applicationSnapshot: value }, "read"),
      ).toBe(true);
    },
  );

  it("keeps empty editable fields available to fill", () => {
    expect(
      isRuntimeFieldVisible({ ...field, readOnly: false }, {}, "edit"),
    ).toBe(true);
    expect(isRuntimeFieldVisible(field, {}, "create")).toBe(true);
  });

  it("preserves explicit hiding and conditional visibility", () => {
    expect(
      isRuntimeFieldVisible({ key: "name", hidden: true }, {}, "edit"),
    ).toBe(false);
    expect(
      isRuntimeFieldVisible({ key: "name", hideOnCreate: true }, {}, "create"),
    ).toBe(false);
    const conditional = {
      key: "name",
      visibleWhen: { field: "status", equals: "ACTIVE" },
    };
    expect(
      isRuntimeFieldVisible(conditional, { status: "DRAFT" }, "edit"),
    ).toBe(false);
    expect(
      isRuntimeFieldVisible(conditional, { status: "ACTIVE" }, "edit"),
    ).toBe(true);
    expect(
      isRuntimeFieldVisible(
        {
          ...conditional,
          visibleWhenAny: [{ field: "status", equals: "DRAFT" }],
        },
        { status: "DRAFT" },
        "edit",
      ),
    ).toBe(true);
  });

  it("uses nested paths with literal keys taking precedence", () => {
    const nested = { ...field, key: "application.snapshot" };
    expect(
      isRuntimeFieldVisible(nested, { application: { snapshot: {} } }, "read"),
    ).toBe(false);
    expect(
      isRuntimeFieldVisible(
        nested,
        { "application.snapshot": "submitted", application: { snapshot: {} } },
        "read",
      ),
    ).toBe(true);
  });
});
