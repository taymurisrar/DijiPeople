import {
  maskedSecret,
  paySetupFormValues,
  paySetupSaveBody,
} from "./pay-setup";

/*
 * TASK-0036 — the Pay setup panel must never send a bank or tax identifier the
 * user did not type: the API keeps a stored secret it is not sent.
 */
describe("pay setup", () => {
  const loaded = {
    basicSalary: "1000.00",
    payFrequency: "MONTHLY",
    effectiveDate: "2026-01-01T00:00:00.000Z",
    bankName: "Meezan",
    bankAccountNumber: "1234567890",
    taxIdentifier: "TX-9",
  };

  it("never loads a secret into the form", () => {
    const form = paySetupFormValues(loaded);
    expect(form.effectiveDate).toBe("2026-01-01");
    expect(Object.values(form)).not.toContain("1234567890");
    expect(Object.keys(form)).not.toContain("bankAccountNumber");
  });

  it("posts only the secrets the user typed", () => {
    const body = paySetupSaveBody(
      paySetupFormValues(loaded),
      { bankIban: "  PK36SCBL0000001123456702 ", taxIdentifier: "   " },
      { region: "north" },
    );
    expect(body).toMatchObject({
      basicSalary: "1000.00",
      bankName: "Meezan",
      bankIban: "PK36SCBL0000001123456702",
      customFields: { region: "north" },
    });
    expect(body).not.toHaveProperty("bankAccountNumber");
    expect(body).not.toHaveProperty("taxIdentifier");
    expect(body).not.toHaveProperty("endDate");
  });

  it("masks all but the last four characters", () => {
    expect(maskedSecret("1234567890")).toBe("••••••7890");
    expect(maskedSecret("123")).toBe("•••");
    expect(maskedSecret(null)).toBe("");
  });
});
