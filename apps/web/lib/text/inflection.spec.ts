import {
  humanizeEnumValue,
  humanizeFieldKey,
  looksLikeEnumToken,
  singularize,
} from "./inflection";

/**
 * BUG-1964 — a record header read "LEAVE POLICIE" because the only
 * singulariser in the tenant product was `label.replace(/s$/, "")`.
 */
describe("singularize", () => {
  it("does not produce the defect that was reported", () => {
    expect(singularize("Leave Policies")).toBe("Leave Policy");
    expect(singularize("Leave Policies")).not.toBe("Leave Policie");
  });

  it("inflects only the last word of a multi-word label", () => {
    expect(singularize("Employee Bank Accounts")).toBe("Employee Bank Account");
    expect(singularize("Business Trips")).toBe("Business Trip");
    expect(singularize("Approval Matrices")).toBe("Approval Matrix");
  });

  it("handles the -es endings that dropping one character breaks", () => {
    expect(singularize("Taxes")).toBe("Tax");
    expect(singularize("Expenses")).toBe("Expense");
    expect(singularize("Batches")).toBe("Batch");
    expect(singularize("Boxes")).toBe("Box");
  });

  it("leaves singular words that end in s alone", () => {
    expect(singularize("Status")).toBe("Status");
    expect(singularize("Address")).toBe("Address");
    expect(singularize("Business")).toBe("Business");
  });

  it("handles irregular plurals", () => {
    expect(singularize("People")).toBe("Person");
    expect(singularize("Children")).toBe("Child");
  });

  it("returns a word it does not recognise unchanged", () => {
    expect(singularize("Payroll")).toBe("Payroll");
    expect(singularize("Onboarding")).toBe("Onboarding");
    expect(singularize("")).toBe("");
  });
});

/**
 * BUG-2009 — the dashboard printed `DRAFT` and
 * `EMPLOYEE_SYSTEM_ACCESS_PROVISIONED` where a phrase belonged.
 */
describe("humanizeEnumValue", () => {
  it("turns the reported constants into phrases", () => {
    expect(humanizeEnumValue("DRAFT")).toBe("Draft");
    expect(humanizeEnumValue("EMPLOYEE_SYSTEM_ACCESS_PROVISIONED")).toBe(
      "Employee system access provisioned",
    );
    expect(humanizeEnumValue("PRESENT")).toBe("Present");
  });

  it("leaves prose and mixed case alone", () => {
    expect(humanizeEnumValue("Annual Leave")).toBe("Annual Leave");
    expect(humanizeEnumValue("checkInAt")).toBe("checkInAt");
    expect(humanizeEnumValue("")).toBe("");
  });

  it("leaves short codes and known acronyms alone", () => {
    // A currency column must not become "Usd".
    expect(humanizeEnumValue("USD")).toBe("USD");
    expect(humanizeEnumValue("QAR")).toBe("QAR");
    expect(humanizeEnumValue("IBAN")).toBe("IBAN");
    expect(humanizeEnumValue("PDF")).toBe("PDF");
  });

  it("treats anything with an underscore as an enum regardless of length", () => {
    expect(looksLikeEnumToken("ON_HOLD")).toBe(true);
    expect(humanizeEnumValue("ON_HOLD")).toBe("On hold");
  });
});

describe("humanizeFieldKey", () => {
  it("turns the reported branding and related-list keys into labels", () => {
    expect(humanizeFieldKey("sidebarActiveBackgroundColor")).toBe(
      "Sidebar active background color",
    );
    expect(humanizeFieldKey("attendanceDate")).toBe("Attendance date");
    expect(humanizeFieldKey("checkInAt")).toBe("Check in at");
    expect(humanizeFieldKey("supportEmail")).toBe("Support email");
  });

  it("handles snake_case and preserves short capitals", () => {
    expect(humanizeFieldKey("business_unit_id")).toBe("Business unit id");
    expect(humanizeFieldKey("glAccountCode")).toBe("Gl account code");
  });

  it("never returns the key unchanged when the key is camelCase", () => {
    expect(humanizeFieldKey("mutedTextColor")).not.toBe("mutedTextColor");
  });
});
