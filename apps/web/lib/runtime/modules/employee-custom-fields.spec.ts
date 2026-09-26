import type { EmployeeCustomFieldDefinition } from "./employee-custom-fields";
import { customFieldErrors } from "./employee-data.adapter";
import {
  buildEmployeeMetadataBundle,
  buildEmployeeEntityMetadata,
  mapEmployeeRecordToRuntimeValues,
  mapEmployeeRuntimeValuesToUpdatePayload,
} from "./employee-metadata.adapter";

/*
 * BUG-3697 — a published custom field on Employees reaches the employee form:
 * as a field, in a section when no form places it, as a record value and as
 * the `customFields` part of a save.
 */

const grade: EmployeeCustomFieldDefinition = {
  logicalName: "ad_grade",
  displayName: "Employee Grade",
  dataType: "select",
  required: true,
  readOnly: false,
  isPrimaryName: false,
  maxLength: null,
  lookupTargetTableKey: null,
  options: [
    { value: "G1", label: "Grade 1" },
    { value: "G2", label: "Grade 2" },
  ],
};
const manager: EmployeeCustomFieldDefinition = {
  ...grade,
  logicalName: "ad_mentor",
  displayName: "Mentor",
  dataType: "lookup",
  required: false,
  lookupTargetTableKey: "employees",
  options: [],
};

describe("employee custom fields", () => {
  const bundle = buildEmployeeMetadataBundle({
    customFields: [grade, manager],
  });

  it("adds supported fields to the entity, leaving lookups off for now", () => {
    const names = bundle.entity.fields.map((field) => field.logicalName);
    expect(names).toContain("ad_grade");
    expect(names).not.toContain("ad_mentor");
    const field = bundle.entity.fields.find(
      (item) => item.logicalName === "ad_grade",
    );
    expect(field?.requirementLevel).toBe("required");
    expect(field?.options?.map((option) => option.value)).toEqual(["G1", "G2"]);
  });

  it("places an unplaced field in one section on the first field tab of every form", () => {
    for (const form of bundle.forms) {
      const section = form.sections.find((item) => item.id === "custom-fields");
      expect(section?.fields.map((field) => field.fieldLogicalName)).toEqual([
        "ad_grade",
      ]);
    }
  });

  it("adds nothing when the tenant has no custom fields", () => {
    const plain = buildEmployeeMetadataBundle();
    expect(
      plain.forms.some((form) =>
        form.sections.some((item) => item.id === "custom-fields"),
      ),
    ).toBe(false);
  });

  it("no built-in employee field could be mistaken for a custom one", () => {
    expect(
      buildEmployeeEntityMetadata().fields.filter((field) =>
        field.logicalName.includes("_"),
      ),
    ).toEqual([]);
  });

  it("reads values from the record and sends them back as customFields", () => {
    const values = mapEmployeeRecordToRuntimeValues({
      id: "e1",
      firstName: "Ada",
      customFields: { ad_grade: "G2", notACustomKey: "x" },
    });
    expect(values.ad_grade).toBe("G2");
    expect(values.notACustomKey).toBeUndefined();
    expect(
      mapEmployeeRuntimeValuesToUpdatePayload(values).customFields,
    ).toEqual({ ad_grade: "G2" });
  });

  it("omits customFields entirely when the form carries none", () => {
    const values = mapEmployeeRecordToRuntimeValues({
      id: "e1",
      firstName: "Ada",
    });
    expect(
      mapEmployeeRuntimeValuesToUpdatePayload(values).customFields,
    ).toBeUndefined();
  });
});

describe("custom field errors", () => {
  it("maps the API's customFields.<field> errors onto the form field", () => {
    expect(
      customFieldErrors({
        "customFields.ad_grade": ["Not a choice for this field."],
        fields: [],
      }),
    ).toEqual({ ad_grade: ["Not a choice for this field."] });
    expect(customFieldErrors({ fields: [] })).toBeUndefined();
  });
});
