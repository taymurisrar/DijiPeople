/*
 * Guards the decision to hide the error dialog.
 *
 * The runtime goes quiet on a failed save whenever the server returns
 * field-level errors, trusting that each one lands against its control. When
 * the named fields are not on the form, that trust produces a save that fails
 * with no message anywhere — which is exactly what happened to every leave
 * request, because the API named `ownerId` and `status` and neither is a form
 * field. These cases pin both directions of that decision.
 */
import { fieldValidationErrorsAreVisible } from "./command-failure-visibility";
import type { FormMetadata } from "./metadata-runtime.types";

function form(...fieldNames: string[]): FormMetadata {
  return {
    id: "form-1",
    logicalName: "leaveMainForm",
    displayName: "Main Form",
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: "leave",
    mode: "create",
    sections: [
      {
        id: "s1",
        label: "Summary",
        order: 1,
        layout: "single-column",
        fields: fieldNames.map((fieldLogicalName, index) => ({
          fieldLogicalName,
          order: index,
        })),
      },
    ],
  };
}

describe("fieldValidationErrorsAreVisible", () => {
  it("is false when the named fields are not on the form", () => {
    // The real leave-request failure: both names live in the record-status
    // header, so nothing inline can render and the dialog must be shown.
    const data = {
      details: {
        fields: [
          { field: "ownerId", message: "property ownerId should not exist" },
          { field: "status", message: "property status should not exist" },
        ],
      },
    };

    expect(
      fieldValidationErrorsAreVisible(
        data,
        form("leaveTypeId", "startDate", "endDate", "reason"),
      ),
    ).toBe(false);
  });

  it("is true when at least one named field is on the form", () => {
    const data = {
      details: { fields: [{ field: "startDate", message: "required" }] },
    };

    expect(
      fieldValidationErrorsAreVisible(data, form("leaveTypeId", "startDate")),
    ).toBe(true);
  });

  it("is true when only some named fields are on the form", () => {
    // One renderable error is enough for the user to see something actionable.
    const data = {
      details: {
        fields: [{ field: "ownerId" }, { field: "startDate" }],
      },
    };

    expect(fieldValidationErrorsAreVisible(data, form("startDate"))).toBe(true);
  });

  it("reads the map shape as well as the array shape", () => {
    expect(
      fieldValidationErrorsAreVisible(
        { fieldErrors: { startDate: "required" } },
        form("startDate"),
      ),
    ).toBe(true);
  });

  it("is false when there are no field errors at all", () => {
    // A plain failure with no field detail always goes to the dialog.
    expect(fieldValidationErrorsAreVisible({ message: "boom" }, form("x"))).toBe(
      false,
    );
    expect(fieldValidationErrorsAreVisible(null, form("x"))).toBe(false);
  });

  it("is false when there is no active form to render errors on", () => {
    const data = { details: { fields: [{ field: "startDate" }] } };

    expect(fieldValidationErrorsAreVisible(data, null)).toBe(false);
  });
});
