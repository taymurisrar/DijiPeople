import {
  buildCreateClaimPayload,
  buildLineItemPayload,
  buildUpdateClaimPayload,
  EMPTY_LINE_ITEM_DRAFT,
  hasHeaderChanges,
  isClaimEditable,
  lineItemToDraft,
  parseAmountInput,
  validateLineItemDraft,
} from "./claim-editor";

describe("isClaimEditable", () => {
  it("is true only for DRAFT", () => {
    expect(isClaimEditable("DRAFT")).toBe(true);
    expect(isClaimEditable("SUBMITTED")).toBe(false);
    expect(isClaimEditable(null)).toBe(false);
    expect(isClaimEditable(undefined)).toBe(false);
  });
});

describe("buildCreateClaimPayload", () => {
  it("trims and uppercases, omitting blank optionals", () => {
    expect(
      buildCreateClaimPayload({
        employeeId: "  ",
        title: "  Taxi fares  ",
        description: "   ",
        currencyCode: "usd",
      }),
    ).toEqual({ title: "Taxi fares", currencyCode: "USD" });
  });

  it("keeps a chosen employee and description", () => {
    expect(
      buildCreateClaimPayload({
        employeeId: "emp-1",
        title: "Client dinner",
        description: "Team dinner with a client",
        currencyCode: "qar",
      }),
    ).toEqual({
      title: "Client dinner",
      currencyCode: "QAR",
      employeeId: "emp-1",
      description: "Team dinner with a client",
    });
  });
});

describe("buildUpdateClaimPayload", () => {
  const original = {
    title: "Taxi fares",
    description: "Airport trips",
    currencyCode: "USD",
  };

  it("is empty when nothing changed", () => {
    const payload = buildUpdateClaimPayload(
      {
        employeeId: "",
        title: "Taxi fares",
        description: "Airport trips",
        currencyCode: "usd",
      },
      original,
    );
    expect(payload).toEqual({});
    expect(hasHeaderChanges(payload)).toBe(false);
  });

  it("only sends the fields that changed", () => {
    const payload = buildUpdateClaimPayload(
      {
        employeeId: "",
        title: "Taxi and parking",
        description: "Airport trips",
        currencyCode: "usd",
      },
      original,
    );
    expect(payload).toEqual({ title: "Taxi and parking" });
    expect(hasHeaderChanges(payload)).toBe(true);
  });

  it("detects a description cleared to empty", () => {
    const payload = buildUpdateClaimPayload(
      {
        employeeId: "",
        title: "Taxi fares",
        description: "",
        currencyCode: "usd",
      },
      original,
    );
    expect(payload).toEqual({ description: "" });
  });

  it("is case-insensitive when comparing currency", () => {
    const payload = buildUpdateClaimPayload(
      {
        employeeId: "",
        title: "Taxi fares",
        description: "Airport trips",
        currencyCode: "USD",
      },
      original,
    );
    expect(payload).toEqual({});
  });
});

describe("parseAmountInput", () => {
  it("parses a valid decimal", () => {
    expect(parseAmountInput("12.50")).toBe(12.5);
  });

  it("is null for blank or non-numeric input", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("   ")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
  });
});

describe("validateLineItemDraft", () => {
  const validDraft = {
    ...EMPTY_LINE_ITEM_DRAFT,
    claimTypeId: "type-1",
    transactionDate: "2026-01-01",
    amount: "10",
  };

  it("passes a complete draft", () => {
    expect(
      validateLineItemDraft(validDraft, { requireReceipt: false }),
    ).toEqual([]);
  });

  it("flags every missing required field", () => {
    const errors = validateLineItemDraft(EMPTY_LINE_ITEM_DRAFT, {
      requireReceipt: false,
    });
    expect(errors).toContain("Claim type is required.");
    expect(errors).toContain("Transaction date is required.");
    expect(errors).toContain("Amount must be greater than zero.");
  });

  it("rejects a zero or negative amount", () => {
    const errors = validateLineItemDraft(
      { ...validDraft, amount: "0" },
      { requireReceipt: false },
    );
    expect(errors).toContain("Amount must be greater than zero.");
  });

  it("requires a receipt only when asked", () => {
    expect(
      validateLineItemDraft(validDraft, { requireReceipt: true }),
    ).toContain("A receipt document is required for this claim subtype.");

    expect(
      validateLineItemDraft(
        { ...validDraft, receiptDocumentId: "doc-1" },
        { requireReceipt: true },
      ),
    ).toEqual([]);
  });
});

describe("buildLineItemPayload", () => {
  it("always uses the claim's currency, never the draft's", () => {
    const payload = buildLineItemPayload(
      {
        claimTypeId: "type-1",
        claimSubTypeId: "",
        transactionDate: "2026-02-01",
        vendor: "  ",
        description: "  ",
        amount: "42.5",
        receiptDocumentId: "",
      },
      "qar",
    );
    expect(payload).toEqual({
      claimTypeId: "type-1",
      transactionDate: "2026-02-01",
      amount: 42.5,
      currencyCode: "QAR",
    });
  });

  it("includes optional fields only when set", () => {
    const payload = buildLineItemPayload(
      {
        claimTypeId: "type-1",
        claimSubTypeId: "sub-1",
        transactionDate: "2026-02-01",
        vendor: "  Taxi Co  ",
        description: "  Airport run  ",
        amount: "10",
        receiptDocumentId: "doc-9",
      },
      "USD",
    );
    expect(payload).toEqual({
      claimTypeId: "type-1",
      claimSubTypeId: "sub-1",
      transactionDate: "2026-02-01",
      amount: 10,
      currencyCode: "USD",
      vendor: "Taxi Co",
      description: "Airport run",
      receiptDocumentId: "doc-9",
    });
  });

  it("defaults an unparsable amount to zero rather than NaN", () => {
    const payload = buildLineItemPayload(
      {
        ...EMPTY_LINE_ITEM_DRAFT,
        claimTypeId: "type-1",
        amount: "not-a-number",
      },
      "USD",
    );
    expect(payload.amount).toBe(0);
  });
});

describe("lineItemToDraft", () => {
  it("maps an existing line item back into editable draft fields", () => {
    expect(
      lineItemToDraft({
        id: "line-1",
        claimTypeId: "type-1",
        claimSubTypeId: "sub-1",
        transactionDate: "2026-02-01T00:00:00.000Z",
        vendor: "Taxi Co",
        description: "Airport run",
        amount: "10.00",
        receiptDocumentId: "doc-9",
      }),
    ).toEqual({
      claimTypeId: "type-1",
      claimSubTypeId: "sub-1",
      transactionDate: "2026-02-01",
      vendor: "Taxi Co",
      description: "Airport run",
      amount: "10.00",
      receiptDocumentId: "doc-9",
    });
  });

  it("defaults absent optionals to empty strings", () => {
    expect(
      lineItemToDraft({
        id: "line-1",
        claimTypeId: "type-1",
        transactionDate: "2026-02-01T00:00:00.000Z",
        amount: "10.00",
      }),
    ).toEqual({
      claimTypeId: "type-1",
      claimSubTypeId: "",
      transactionDate: "2026-02-01",
      vendor: "",
      description: "",
      amount: "10.00",
      receiptDocumentId: "",
    });
  });
});
