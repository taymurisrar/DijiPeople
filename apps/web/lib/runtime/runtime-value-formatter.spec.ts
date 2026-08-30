import { formatRuntimeFieldValue } from "./runtime-value-formatter";
import type { FieldMetadata } from "./metadata-runtime.types";

/**
 * BUG-2009 (surface 2) — the Attendance tab on an employee record rendered
 * `PRESENT` in its status cell while the standalone `/attendance` list, over
 * the same data, rendered "Present". Both go through
 * `formatRuntimeFieldValue`; the difference was whether the caller had field
 * metadata with a matching declared option. A related list frequently does
 * not — either the field is generic (no metadata registry entry) or the
 * option was never declared — and the value used to reach the screen raw
 * either way.
 */
describe("formatRuntimeFieldValue — BUG-2009", () => {
  it("uses a declared optionset label when one matches", () => {
    const field = {
      dataType: "optionset",
      options: [{ value: "PRESENT", label: "Present" }],
    } as unknown as FieldMetadata;

    expect(
      formatRuntimeFieldValue({ field, value: "PRESENT" }),
    ).toBe("Present");
  });

  it("humanises an optionset value with no matching declared option", () => {
    const field = {
      dataType: "optionset",
      options: [{ value: "ON_LEAVE", label: "On leave" }],
    } as unknown as FieldMetadata;

    expect(formatRuntimeFieldValue({ field, value: "PRESENT" })).toBe(
      "Present",
    );
  });

  it("humanises a raw enum value when there is no field metadata at all", () => {
    // The shape of a generic related-list cell: no FieldMetadata entry.
    expect(
      formatRuntimeFieldValue({ field: undefined, value: "PRESENT" }),
    ).toBe("Present");
    expect(
      formatRuntimeFieldValue({
        field: undefined,
        value: "EMPLOYEE_SYSTEM_ACCESS_PROVISIONED",
      }),
    ).toBe("Employee system access provisioned");
  });

  it("leaves ordinary prose alone", () => {
    expect(
      formatRuntimeFieldValue({ field: undefined, value: "Fatima Ahmed" }),
    ).toBe("Fatima Ahmed");
  });
});
