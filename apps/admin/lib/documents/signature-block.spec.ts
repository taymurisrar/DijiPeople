import {
  buildSignatureBlockHtml,
  SIGNATURE_LINES,
  WET_INK_PARTY,
} from "./signature-block";

/**
 * What a signature box may and may not put into a contract.
 *
 * Two failure modes are worth pinning, and neither is visible when the box is
 * inserted — both surface later, in an executed agreement:
 *
 *  - markup the API's sanitiser deletes, so the box vanishes on save;
 *  - a placeholder for a party the platform never fills, so the signed PDF
 *    carries a literal `{{signature.witness.name}}` where a signature belongs.
 *    Unresolved `signature.*` tokens are configured `LEAVE_TOKEN`, so nothing
 *    upstream raises this — it just prints.
 */
describe("signature block markup", () => {
  const ALL_LINES = SIGNATURE_LINES.map((line) => line.key);

  it("uses only tags the API's contract sanitiser allows", () => {
    /*
     * `cleanContractHtml` allows table/tbody/tr/th/td/strong/p and strips div
     * outright. A block built from divs would be deleted the first time the
     * template was saved, with no error shown anywhere.
     */
    const html = buildSignatureBlockHtml(
      { slot: "counterparty", label: "Counterparty" },
      "For and on behalf of",
      ALL_LINES,
      "counterparty.name",
    );
    const tags = [...html.matchAll(/<\/?([a-z]+)/g)].map((match) => match[1]);
    expect(new Set(tags)).toEqual(
      new Set(["table", "tbody", "tr", "th", "td", "strong", "p"]),
    );
  });

  it("marks the table with the one data attribute that survives sanitising", () => {
    const html = buildSignatureBlockHtml(
      { slot: "platform", label: "Platform" },
      "",
      ["signature"],
      null,
    );
    expect(html).toContain('data-document-role="signature-block"');
    // Anything under `data-signature-*` would be stripped; nothing may rely on it.
    expect(html).not.toContain("data-signature");
  });

  it("fills signature and date from the party's own slot", () => {
    const html = buildSignatureBlockHtml(
      { slot: "platform", label: "Platform" },
      "",
      ["signature", "date"],
      "platform.legalName",
    );
    expect(html).toContain("{{signature.platform.name}}");
    expect(html).toContain("{{signature.platform.date}}");
  });

  it("never emits a token for a party that signs by hand", () => {
    const html = buildSignatureBlockHtml(
      { ...WET_INK_PARTY, label: "Witness" },
      "Witnessed by",
      ALL_LINES,
      null,
    );
    expect(html).not.toContain("{{");
    // Ruled and empty, one cell per requested line.
    expect(html.match(/&nbsp;/g)).toHaveLength(ALL_LINES.length);
  });

  it("leaves the printed name ruled when the party has no name placeholder", () => {
    const html = buildSignatureBlockHtml(
      { slot: "party.primary", label: "Primary party" },
      "",
      ["name"],
      null,
    );
    expect(html).not.toContain("{{");
  });

  it("keeps the lines in print order however they were chosen", () => {
    const html = buildSignatureBlockHtml(
      { slot: "counterparty", label: "Counterparty" },
      "",
      ["date", "signature"],
      null,
    );
    expect(html.indexOf("Signature")).toBeLessThan(html.indexOf("Date"));
  });

  it("escapes a caption rather than letting it become markup", () => {
    const html = buildSignatureBlockHtml(
      { slot: "counterparty", label: "Counterparty" },
      "<script>alert(1)</script>",
      ["signature"],
      null,
    );
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the caption row entirely when there is no caption", () => {
    const html = buildSignatureBlockHtml(
      { slot: "counterparty", label: "Counterparty" },
      "   ",
      ["signature"],
      null,
    );
    expect(html).not.toContain("<th");
  });
});
