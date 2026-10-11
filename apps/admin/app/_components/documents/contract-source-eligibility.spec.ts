import {
  describeContractApiError,
  requiredSignerFields,
  signerErrors,
  templateOptionState,
  type TemplateEligibility,
} from "./contract-source-eligibility";

/*
 * WS05. The Create Agreement launcher listed every template for every record
 * and let the API refuse the wrong pairing after submit. These are the rules
 * that now shape the picker before anything is sent.
 */
const base: TemplateEligibility = {
  templateId: "template-1",
  name: "Customer Agreement",
  contractType: "CUSTOMER_AGREEMENT",
  eligible: true,
  status: "ELIGIBLE",
  missingFields: [],
  unsupportedFields: [],
};

const needsSigner: TemplateEligibility = {
  ...base,
  eligible: false,
  status: "NEEDS_SIGNER",
  missingFields: [
    {
      key: "customer.primarySigner.name",
      label: "Customer authorized signatory",
      collectable: true,
    },
    {
      key: "customer.primarySigner.email",
      label: "Customer signatory email",
      collectable: true,
    },
  ],
};

const unsupported: TemplateEligibility = {
  ...base,
  name: "Tenant Provisioning",
  eligible: false,
  status: "INELIGIBLE",
  unsupportedFields: ["tenant.name"],
};

describe("template picker state", () => {
  it("offers an eligible template as is", () => {
    expect(templateOptionState(base)).toEqual({
      disabled: false,
      label: "Customer Agreement",
      reason: null,
    });
  });

  it("keeps a signer-only gap selectable", () => {
    expect(templateOptionState(needsSigner).disabled).toBe(false);
  });

  it("disables a template the record can never fill, with the reason", () => {
    const state = templateOptionState(unsupported);
    expect(state.disabled).toBe(true);
    expect(state.reason).toContain("tenant.name");
  });
});

describe("signer inputs", () => {
  it("asks only for the signer fields the template is missing", () => {
    expect(requiredSignerFields(needsSigner)).toEqual(["name", "email"]);
    expect(requiredSignerFields(base)).toEqual([]);
    expect(requiredSignerFields(unsupported)).toEqual([]);
  });

  it("requires each field and a valid email", () => {
    expect(signerErrors(["name", "email"], {})).toEqual({
      name: "Signer name is required.",
      email: "Signer email is required.",
    });
    expect(
      signerErrors(["email"], { email: "not-an-email" }).email,
    ).toMatch(/valid/);
    expect(
      signerErrors(["name", "email"], {
        name: "Amal Hassan",
        email: "amal@example.test",
      }),
    ).toEqual({});
  });

  it("enforces the API's length limits", () => {
    expect(signerErrors(["title"], { title: "x".repeat(201) }).title).toMatch(
      /200/,
    );
  });
});

describe("API error mapping", () => {
  it("lists the missing and unsupported fields from the error contract", () => {
    expect(
      describeContractApiError(
        {
          errorCode: "CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE",
          message: "This customer has no authorized signer on record.",
          details: {
            missingFields: [
              {
                key: "customer.primarySigner.title",
                label: "Customer signatory title",
                collectable: true,
              },
            ],
            unsupportedFields: ["tenant.name"],
          },
        },
        "Unable to create contract.",
      ),
    ).toEqual({
      message: "This customer has no authorized signer on record.",
      fields: [
        "Customer signatory title",
        "tenant.name (not available from this record)",
      ],
    });
  });

  it("falls back when the response carries no message", () => {
    expect(describeContractApiError(null, "Unable to create contract.")).toEqual(
      { message: "Unable to create contract.", fields: [] },
    );
  });
});
