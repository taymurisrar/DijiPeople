import { emailFormatError, isEmailShaped } from "./email-format";

describe("email format", () => {
  it.each(["a@b.co", " name@company.com ", "first.last+tag@sub.example.org"])(
    "accepts %s",
    (value) => expect(isEmailShaped(value)).toBe(true),
  );
  it.each(["", "plain", "a@b", "a @b.com", "@b.com", "a@@b.com", "a@b.c"])(
    "rejects %s",
    (value) => expect(isEmailShaped(value)).toBe(false),
  );
  it("reports nothing for blank (required-ness is a separate rule)", () => {
    expect(emailFormatError("  ")).toBeNull();
  });
  it("reports an actionable message for a malformed value", () => {
    expect(emailFormatError("not-an-email")).toMatch(/valid email address/);
  });
});
