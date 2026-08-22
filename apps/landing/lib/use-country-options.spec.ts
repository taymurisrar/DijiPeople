import { BUNDLED_COUNTRIES } from "./use-country-options";

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
