import { BUNDLED_COUNTRIES, isUsableLookupList } from "./use-country-options";

/**
 * The country field is a list, and stays one.
 *
 * This exists because "why is country not a lookup?" was asked about a field
 * that had already been changed into one. The change was real; the fallback was
 * silent. When `/public/geography/countries` could not be read — an API process
 * that had not restarted since the endpoint shipped answers 404 — the field
 * quietly rendered the same free-text input it always had, which is
 * indistinguishable from nothing having happened.
 *
 * The rule pinned here is that the offered list is never empty, so the control
 * is never chosen by whether a network call succeeded.
 */
describe("bundled country list", () => {
  it("offers countries with no network call at all", () => {
    expect(BUNDLED_COUNTRIES.length).toBeGreaterThan(20);
  });

  it("carries an ISO code and a name for every entry", () => {
    for (const country of BUNDLED_COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name.trim().length).toBeGreaterThan(1);
    }
  });

  it("excludes OTHER, which is not a country", () => {
    /*
     * `COUNTRY_OPTIONS` ends in "Somewhere else" because it also answers "where
     * did you hear about us". Persisting that as a customer's country would put
     * a non-country in a country column — the same data-quality defect the
     * lookup was introduced to fix, arriving by a different route.
     */
    expect(BUNDLED_COUNTRIES.some((country) => country.code === "OTHER")).toBe(
      false,
    );
  });

  it("gives every entry a distinct key", () => {
    // Duplicate keys make React drop options silently rather than loudly.
    const ids = new Set(BUNDLED_COUNTRIES.map((country) => country.id));
    expect(ids.size).toBe(BUNDLED_COUNTRIES.length);
  });
});

describe("isUsableLookupList", () => {
  function remote(count: number) {
    return Array.from({ length: count }, (_unused, index) => ({
      id: `iso:${index}`,
      code: "ZZ",
      name: `Country ${index}`,
    }));
  }

  /*
   * BUG-1304. Production's `/public/geography/countries` returns eight
   * countries — the `ensureDefaultCountries` defaults — because the ISO
   * widening never succeeded there and fails silently by design. The old test
   * was `length > 0`, so eight beat the 31 bundled countries and a buyer
   * outside those eight markets had nothing to select on a required field.
   */
  it("rejects a lookup answer narrower than the bundle", () => {
    expect(isUsableLookupList(remote(8))).toBe(false);
    expect(isUsableLookupList(remote(BUNDLED_COUNTRIES.length - 1))).toBe(
      false,
    );
  });

  it("still rejects the empty and malformed answers it always did", () => {
    expect(isUsableLookupList([])).toBe(false);
    expect(isUsableLookupList(null)).toBe(false);
    expect(isUsableLookupList(undefined)).toBe(false);
    expect(isUsableLookupList({ data: [] })).toBe(false);
  });

  // Widening is the whole point of the lookup; it must not be blocked.
  it("accepts the full ISO set", () => {
    expect(isUsableLookupList(remote(250))).toBe(true);
  });

  it("accepts an answer exactly as wide as the bundle", () => {
    expect(isUsableLookupList(remote(BUNDLED_COUNTRIES.length))).toBe(true);
  });
});
