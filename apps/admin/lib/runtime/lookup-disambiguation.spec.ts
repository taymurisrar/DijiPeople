import { normalizeRuntimeLookupPayload } from "./runtime-lookups";

/**
 * BUG-1553 — pickers offered entries the operator could not tell apart.
 *
 * The owner picker listed "Taimur Israr" twice, for two genuinely different
 * accounts, and the contract template list showed the same agreement name
 * twice. In both cases the operator had to guess, and a wrong guess assigns the
 * wrong owner or generates from the wrong template.
 */
describe("BUG-1553 — duplicate lookup labels disambiguate themselves", () => {
  it("adds the email when two people share a name", () => {
    const options = normalizeRuntimeLookupPayload([
      { id: "a", fullName: "Taimur Israr", email: "taimur@dijipeople.com" },
      { id: "b", fullName: "Taimur Israr", email: "taimur.israr@folio3.com" },
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "Taimur Israr (taimur@dijipeople.com)",
      "Taimur Israr (taimur.israr@folio3.com)",
    ]);
  });

  it("leaves a unique label alone", () => {
    /*
     * Showing everyone's email beside their name would clutter every picker in
     * the console to solve a problem that exists in two of them. The
     * disambiguator is only informative when there is something to
     * disambiguate from.
     */
    const options = normalizeRuntimeLookupPayload([
      { id: "a", fullName: "Aisha Rahman", email: "aisha@example.com" },
      { id: "b", fullName: "Taimur Israr", email: "taimur@example.com" },
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "Aisha Rahman",
      "Taimur Israr",
    ]);
  });

  it("uses a version when two documents share a title", () => {
    const options = normalizeRuntimeLookupPayload([
      { id: "a", name: "SaaS Subscription Agreement", version: 1 },
      { id: "b", name: "SaaS Subscription Agreement", version: 2 },
    ]);
    expect(options.map((option) => option.label)).toEqual([
      "SaaS Subscription Agreement (v1)",
      "SaaS Subscription Agreement (v2)",
    ]);
  });

  it("falls back to a short id rather than leaving them identical", () => {
    // A poor disambiguator. Two identical entries with no way to choose
    // between them is a worse one.
    const options = normalizeRuntimeLookupPayload([
      { id: "0f9c1b2a-1111-4111-8111-111111111111", name: "Template" },
      { id: "7ab34cde-2222-4222-8222-222222222222", name: "Template" },
    ]);
    expect(options[0].label).toBe("Template (0f9c1b2a)");
    expect(options[1].label).toBe("Template (7ab34cde)");
    expect(options[0].label).not.toBe(options[1].label);
  });

  it("does not append a disambiguator identical to the label", () => {
    // `name` and `code` being the same string adds a parenthesis and nothing
    // else, which is noise pretending to be information.
    const options = normalizeRuntimeLookupPayload([
      { id: "a", name: "ACME", code: "ACME" },
      { id: "b", name: "ACME", code: "ACME" },
    ]);
    expect(options[0].label).toBe("ACME (a)");
  });

  it("still returns one option per item", () => {
    const options = normalizeRuntimeLookupPayload([
      { id: "a", fullName: "Same Name", email: "one@example.com" },
      { id: "b", fullName: "Same Name", email: "two@example.com" },
      { id: "c", fullName: "Other" },
    ]);
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.value)).toEqual(["a", "b", "c"]);
  });
});
