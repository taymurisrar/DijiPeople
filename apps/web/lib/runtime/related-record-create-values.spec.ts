/*
 * BUG-2012 — the related-list create dialog pre-filled child fields with the
 * parent record's values. The four rows below are the collisions the record
 * confirmed by reading the declarations; each of them fails against the old
 * "spread the whole parent record" assembly.
 *
 * BUG-2011 is the other half of this code path: the parent foreign key must
 * still be sent. The last block here asserts that, so a future narrowing cannot
 * quietly undo it.
 */
import {
  buildQuickCreateValues,
  filterToFormFields,
  resolveInheritedParentValues,
} from "./related-record-create-values";
import type { FormMetadata } from "./metadata-runtime.types";

function formWithFields(fieldLogicalNames: readonly string[]): FormMetadata {
  return {
    logicalName: "quickCreate",
    label: "Quick Create",
    sections: [
      {
        label: "Details",
        fields: fieldLogicalNames.map((fieldLogicalName) => ({
          fieldLogicalName,
        })),
      },
    ],
  } as unknown as FormMetadata;
}

describe("resolveInheritedParentValues", () => {
  const organization = {
    id: "org-1",
    name: "DijiPeople Demo",
    description: "The demo organization",
    isActive: true,
    sortOrder: 3,
  };

  it("inherits nothing when the subgrid declares nothing", () => {
    expect(resolveInheritedParentValues(organization, undefined)).toEqual({});
    expect(resolveInheritedParentValues(organization, [])).toEqual({});
  });

  it("inherits only the declared fields", () => {
    expect(
      resolveInheritedParentValues(organization, ["description"]),
    ).toEqual({ description: "The demo organization" });
  });

  it("skips a declared field the parent does not carry", () => {
    expect(
      resolveInheritedParentValues(organization, ["currencyCode"]),
    ).toEqual({});
  });

  it("skips null and empty values rather than seeding a blank", () => {
    expect(
      resolveInheritedParentValues(
        { name: "", description: null, sortOrder: 0 },
        ["name", "description", "sortOrder"],
      ),
    ).toEqual({ sortOrder: 0 });
  });

  it("handles a missing parent record", () => {
    expect(resolveInheritedParentValues(undefined, ["name"])).toEqual({});
  });
});

describe("buildQuickCreateValues", () => {
  /* The four confirmed collisions from the record, as data. */
  const collisions = [
    {
      relation: "Organization > Business Units",
      parent: {
        id: "org-1",
        name: "DijiPeople Demo",
        description: "The demo organization",
      },
      parentBinding: { fieldLogicalName: "organizationId", recordId: "org-1" },
      childFields: ["name", "description", "organizationId"],
    },
    {
      relation: "Business Unit > Departments",
      parent: { id: "bu-1", name: "Engineering", description: "Builds it" },
      parentBinding: { fieldLogicalName: "businessUnitId", recordId: "bu-1" },
      childFields: ["name", "description", "businessUnitId"],
    },
    {
      relation: "Department > Teams",
      parent: { id: "dep-1", name: "Platform" },
      parentBinding: { fieldLogicalName: "departmentId", recordId: "dep-1" },
      childFields: ["name", "departmentId"],
    },
    {
      relation: "State / Province > Cities",
      parent: { id: "st-1", name: "Sindh", isActive: true, sortOrder: 2 },
      parentBinding: { fieldLogicalName: "stateId", recordId: "st-1" },
      childFields: ["name", "isActive", "sortOrder", "stateId"],
    },
  ] as const;

  it.each(collisions.map((row) => [row.relation, row] as const))(
    "%s opens empty except the parent foreign key",
    (_relation, row) => {
      const values = buildQuickCreateValues({
        /* No subgrid declares inheritance, so nothing is carried down. */
        inheritedValues: resolveInheritedParentValues(row.parent, undefined),
        record: {},
        draftValues: {},
        parentBinding: row.parentBinding,
      });

      const posted = filterToFormFields(values, formWithFields(row.childFields));

      expect(posted).toEqual({
        [row.parentBinding.fieldLogicalName]: row.parentBinding.recordId,
      });
      expect(posted.name).toBeUndefined();
    },
  );

  it("still sends the parent foreign key — BUG-2011 must not be undone", () => {
    const values = buildQuickCreateValues({
      inheritedValues: {},
      record: {},
      draftValues: { name: "Platform Team" },
      parentBinding: { fieldLogicalName: "departmentId", recordId: "dep-1" },
    });

    expect(values.departmentId).toBe("dep-1");
    expect(values.name).toBe("Platform Team");
  });

  it("does not let a draft value overwrite the parent foreign key", () => {
    const values = buildQuickCreateValues({
      draftValues: { departmentId: "someone-elses-department" },
      parentBinding: { fieldLogicalName: "departmentId", recordId: "dep-1" },
    });

    expect(values.departmentId).toBe("dep-1");
  });

  it("carries a declared inheritance through to the posted body", () => {
    const values = buildQuickCreateValues({
      inheritedValues: resolveInheritedParentValues(
        { id: "prj-1", currencyCode: "QAR", name: "Migration" },
        ["currencyCode"],
      ),
      parentBinding: { fieldLogicalName: "projectId", recordId: "prj-1" },
    });

    const posted = filterToFormFields(
      values,
      formWithFields(["currencyCode", "name", "projectId"]),
    );

    expect(posted).toEqual({ currencyCode: "QAR", projectId: "prj-1" });
    /* The parent's name is still not inherited — only what was declared. */
    expect(posted.name).toBeUndefined();
  });

  it("lets the user's own edits win over an inherited value", () => {
    const values = buildQuickCreateValues({
      inheritedValues: { currencyCode: "QAR" },
      draftValues: { currencyCode: "USD" },
    });

    expect(values.currencyCode).toBe("USD");
  });
});

describe("filterToFormFields", () => {
  it("returns the record untouched when there is no form", () => {
    expect(filterToFormFields({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it("drops values the child form does not declare", () => {
    expect(
      filterToFormFields({ a: 1, b: 2 }, formWithFields(["a"])),
    ).toEqual({ a: 1 });
  });
});
