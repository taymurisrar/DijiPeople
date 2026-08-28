import {
  humanizeErrorMessage,
  humanizeFieldError,
} from "./humanize-field-error";

/**
 * BUG-1549 — admin error modals showed implementation detail.
 *
 * "primaryContactFirstName must be shorter than or equal to 100 characters" is
 * a DTO property name and a class-validator constraint. "Database constraint
 * failed" is a Postgres failure class. Neither corresponds to anything the
 * operator can see on screen.
 */
describe("BUG-1549 — a field error names the field the operator sees", () => {
  it("swaps the DTO property for the form label", () => {
    expect(
      humanizeFieldError(
        "primaryContactFirstName",
        "primaryContactFirstName must be shorter than or equal to 100 characters",
        "Contact first name",
      ),
    ).toBe(
      "Contact first name must be shorter than or equal to 100 characters",
    );
  });

  it("leaves the constraint half exactly as it arrived", () => {
    /*
     * The constraint is the part that says what is actually wrong. Rewriting it
     * would mean guessing at rules this file cannot see, so only the name is
     * changed.
     */
    const result = humanizeFieldError(
      "partnerId",
      "partnerId must be a UUID",
      "Partner",
    );
    expect(result).toBe("Partner must be a UUID");
  });

  it("does nothing without a label to substitute", () => {
    expect(humanizeFieldError("x", "x must be a UUID", undefined)).toBe(
      "x must be a UUID",
    );
  });

  it("does not rename a longer property that merely starts the same way", () => {
    // `partner` must not rewrite the start of `partnerId must be a UUID`.
    expect(
      humanizeFieldError("partner", "partnerId must be a UUID", "Partner name"),
    ).toBe("partnerId must be a UUID");
  });

  it("leaves a message that does not start with the property alone", () => {
    expect(
      humanizeFieldError(
        "email",
        "A user with this email already exists",
        "Work email",
      ),
    ).toBe("A user with this email already exists");
  });
});

describe("BUG-1549 — an internal failure says what to do", () => {
  it("replaces a Postgres constraint class", () => {
    const result = humanizeErrorMessage("Database constraint failed");
    expect(result).not.toMatch(/database/i);
    expect(result).toMatch(/unique/i);
  });

  it("does not pretend to know which field caused it", () => {
    // The message says where to look, not what is wrong, because it does not
    // know — inventing a field would be worse than the raw string.
    expect(humanizeErrorMessage("Database constraint failed")).toMatch(
      /Check any fields/,
    );
  });

  it("leaves a message that was already meant for a person", () => {
    const message = "This plan cannot be deleted because 2 prices exist.";
    expect(humanizeErrorMessage(message)).toBe(message);
  });

  it("handles empty input without throwing", () => {
    expect(humanizeErrorMessage("")).toBe("");
    expect(humanizeFieldError("a", "", "A")).toBe("");
  });
});
