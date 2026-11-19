import {
  contractReadinessMessage,
  missingContractFields,
} from "./contract-readiness";

const field = (
  over: Partial<Parameters<typeof missingContractFields>[0][0]>,
) => ({
  key: "contract.effectiveDate",
  label: "Effective date",
  required: true,
  value: "2026-01-01",
  ...over,
});

describe("missingContractFields", () => {
  it("is empty when every required field has a value", () => {
    expect(missingContractFields([field({})])).toEqual([]);
  });
  it("names every blank required field at once", () => {
    const gaps = missingContractFields([
      field({ value: "" }),
      field({ key: "contract.expiryDate", label: "Expiry date", value: "  " }),
    ]);
    expect(gaps).toEqual([
      "Effective date is required.",
      "Expiry date is required.",
    ]);
  });
  it("ignores optional blanks and signature terms", () => {
    expect(
      missingContractFields([
        field({ required: false, value: "" }),
        field({
          key: "signature.platform.date",
          label: "Signing date",
          value: "",
        }),
      ]),
    ).toEqual([]);
  });
  it("surfaces a server-reported problem on a filled field", () => {
    expect(
      missingContractFields([field({ problem: "must be in the future" })]),
    ).toEqual(["Effective date: must be in the future"]);
  });
  it("builds one message, or null when ready", () => {
    expect(contractReadinessMessage([])).toBeNull();
    expect(contractReadinessMessage(["A is required."])).toMatch(
      /before submitting/,
    );
  });
});
