import {
  findDocumentTokens,
  groupOfferedFields,
  placeholderDefinitionsQuery,
  type PlaceholderFieldDefinition,
} from "./placeholder-fields";
import {
  buildSignatureBlockHtml,
  signaturePartiesFromRegistry,
  signaturePartyNameToken,
  WET_INK_PARTY,
} from "./signature-block";

function field(
  key: string,
  group: string,
  extra: Partial<PlaceholderFieldDefinition> = {},
): PlaceholderFieldDefinition {
  return {
    key,
    label: key,
    dataType: "TEXT",
    sourceEntity: key.split(".")[0],
    group,
    ...extra,
  };
}

/*
 * What the API serves for a lead agreement: context-free groups, the lead's
 * own namespace and the signature slots — and no customer group.
 */
const LEAD_AGREEMENT = [
  field("platform.legalName", "Platform"),
  field("contract.number", "Contract"),
  field("lead.companyName", "Lead"),
  field("lead.signer.name", "Lead"),
  field("commercial.planName", "Commercial"),
  field("signature.platform.name", "Signatures", {
    label: "Platform signature",
    dataType: "SIGNATURE",
  }),
  field("signature.counterparty.name", "Signatures", {
    label: "Counterparty signature",
    dataType: "SIGNATURE",
  }),
  field("signature.counterparty.date", "Signatures"),
  field("customer.name", "Customer", {
    deprecatedFor: "customer.companyName",
  }),
];
const ORDER = ["Platform", "Lead", "Customer", "Commercial", "Contract"];

describe("context-aware placeholder fields", () => {
  it("asks the API for the agreement's own context", () => {
    expect(
      placeholderDefinitionsQuery({
        contractType: "SUBSCRIPTION_AGREEMENT",
        contractId: "6f1c1f3e-8d0e-4c43-9d55-0f0a1f6f7a10",
      }),
    ).toBe(
      "?contractType=SUBSCRIPTION_AGREEMENT&contractId=6f1c1f3e-8d0e-4c43-9d55-0f0a1f6f7a10",
    );
    expect(placeholderDefinitionsQuery({})).toBe("");
  });

  it("lists exactly the groups the API offered, in the API's order", () => {
    const groups = groupOfferedFields(LEAD_AGREEMENT, "", ORDER).map(
      (entry) => entry.group,
    );
    expect(groups).toEqual(["Platform", "Lead", "Commercial", "Contract"]);
    // The frontend never adds a group the API did not offer.
    expect(groups).not.toContain("Customer");
  });

  it("never lists signature tokens or superseded keys as ordinary fields", () => {
    const keys = groupOfferedFields(LEAD_AGREEMENT, "", ORDER).flatMap(
      (entry) => entry.items.map((item) => item.key),
    );
    expect(keys.some((key) => key.startsWith("signature."))).toBe(false);
    expect(keys).not.toContain("customer.name");
  });

  it("filters by search across key, label and group", () => {
    expect(
      groupOfferedFields(LEAD_AGREEMENT, "signer", ORDER).flatMap((entry) =>
        entry.items.map((item) => item.key),
      ),
    ).toEqual(["lead.signer.name"]);
    expect(
      groupOfferedFields(LEAD_AGREEMENT, "commercial", ORDER).map(
        (entry) => entry.group,
      ),
    ).toEqual(["Commercial"]);
    expect(groupOfferedFields(LEAD_AGREEMENT, "zzz", ORDER)).toEqual([]);
  });
});

describe("one signature mechanism", () => {
  it("offers the registry's signature slots as signers, then wet ink", () => {
    expect(signaturePartiesFromRegistry(LEAD_AGREEMENT)).toEqual([
      { slot: "platform", label: "Platform signature" },
      { slot: "counterparty", label: "Counterparty signature" },
      WET_INK_PARTY,
    ]);
  });

  it("prints the party's name from its own namespace when the registry has one", () => {
    expect(
      signaturePartyNameToken(
        { slot: "platform", label: "Platform" },
        LEAD_AGREEMENT,
      ),
    ).toBe("platform.legalName");
    expect(signaturePartyNameToken(WET_INK_PARTY, LEAD_AGREEMENT)).toBeNull();
  });

  it("prints the chosen signer role on the title line", () => {
    const html = buildSignatureBlockHtml(
      { slot: "counterparty", label: "Counterparty" },
      "",
      ["signature", "title", "date"],
      null,
      "Authorized signatory",
    );
    expect(html).toContain(
      "<td><strong>Title</strong></td><td>Authorized signatory</td>",
    );
    expect(html).toContain("{{signature.counterparty.name}}");
    expect(html).toContain("{{signature.counterparty.date}}");
  });

  it("escapes a signer role", () => {
    const html = buildSignatureBlockHtml(
      { slot: "counterparty", label: "Counterparty" },
      "",
      ["title"],
      null,
      "<b>CEO</b>",
    );
    expect(html).not.toContain("<b>");
  });

  it("marks signature tokens apart from merge fields, legacy spellings included", () => {
    const tokens = findDocumentTokens(
      "Signed {{ signature.partner.name }} for {{lead.companyName}} on {{signature.counterparty.date}}",
    );
    expect(tokens.map((token) => [token.key, token.kind])).toEqual([
      ["signature.partner.name", "signature"],
      ["lead.companyName", "field"],
      ["signature.counterparty.date", "signature"],
    ]);
    expect(
      "Signed {{ signature.partner.name }}".slice(tokens[0].from, tokens[0].to),
    ).toBe("{{ signature.partner.name }}");
  });
});
