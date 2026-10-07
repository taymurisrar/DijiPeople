import { normalizeApiError } from "../api-error";
import { readFieldErrors } from "./http-module-runtime-adapter";
import {
  describeActionNotice,
  readDeleteOutcome,
} from "./runtime-action-outcome";

/**
 * What the console tells an operator after an action, read from where the API
 * actually puts it (EXECPLAN-0055 WP-01).
 */

describe("readDeleteOutcome", () => {
  it("surfaces a refusal that the API wrapped inside data", () => {
    const outcome = readDeleteOutcome({
      success: true,
      data: {
        deleted: 0,
        refused: [{ id: "p1", label: "Acme", reason: "it has an application" }],
        message:
          "Nothing was deleted. Kept 1: Acme — it still has the partner application it came from.",
      },
    });
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain("Kept 1: Acme");
  });

  it("treats a partial delete as not a success, so the kept rows are reported", () => {
    const outcome = readDeleteOutcome({
      success: true,
      data: {
        deleted: 2,
        refused: [{ label: "Acme", reason: "x" }],
        message: "Deleted 2 records. Kept 1: Acme — x.",
      },
    });
    expect(outcome.success).toBe(false);
    expect(outcome.refusedCount).toBe(1);
  });

  it("reports a clean delete as a success with the API's sentence", () => {
    const outcome = readDeleteOutcome({
      success: true,
      data: { deleted: 1, refused: [], message: "Deleted 1 record." },
    });
    expect(outcome).toMatchObject({
      success: true,
      message: "Deleted 1 record.",
    });
  });

  it("reads deletedCount from the modules that answer with it", () => {
    expect(
      readDeleteOutcome({ success: true, data: { deletedCount: 3 } }).success,
    ).toBe(true);
    expect(
      readDeleteOutcome({ success: true, data: { deletedCount: 0 } }).success,
    ).toBe(false);
  });
});

describe("describeActionNotice", () => {
  it("colours by the success flag, not by the wording", () => {
    expect(
      describeActionNotice({
        success: false,
        message: "Action reject-partner is not available for partners.",
      }),
    ).toEqual({
      text: "Action reject-partner is not available for partners.",
      failed: true,
    });
    expect(
      describeActionNotice({
        success: true,
        message: "Unable is a fine word.",
      }),
    ).toEqual({ text: "Unable is a fine word.", failed: false });
  });

  it("falls back to data.message for a raw runtime result", () => {
    expect(
      describeActionNotice({
        success: true,
        data: { message: "Deleted 1 record." },
      }),
    ).toEqual({ text: "Deleted 1 record.", failed: false });
  });
});

describe("readFieldErrors", () => {
  it("reads the error contract's fieldErrors", () => {
    expect(
      readFieldErrors({
        fieldErrors: [{ field: "email", message: "email must be an email" }],
      }),
    ).toEqual([{ field: "email", message: "email must be an email" }]);
  });

  it("keeps errors as the fallback", () => {
    expect(
      readFieldErrors({ errors: [{ field: "name", message: "required" }] }),
    ).toEqual([{ field: "name", message: "required" }]);
  });

  it("returns nothing when neither is present", () => {
    expect(readFieldErrors({ message: "x" })).toBeUndefined();
  });
});

describe("normalizeApiError for a domain 400", () => {
  const domain = {
    statusCode: 400,
    errorCode: "VALIDATION_FAILED",
    message: "The immutable partner application submission was not found.",
    description: "Review the highlighted fields and submit again.",
    traceId: "t1",
  };

  it("drops the highlighted-fields hint when no field was named", () => {
    const error = normalizeApiError(domain, 400);
    expect(error.message).toBe(domain.message);
    expect(error.description).toBe("");
  });

  it("keeps it when the API did name fields", () => {
    const error = normalizeApiError(
      { ...domain, fieldErrors: [{ field: "email", message: "bad" }] },
      400,
    );
    expect(error.description).toBe(domain.description);
  });

  it("keeps it for the catalog's own generic message", () => {
    const error = normalizeApiError(
      { ...domain, message: "Validation failed" },
      400,
    );
    expect(error.description).toBe(domain.description);
  });
});
