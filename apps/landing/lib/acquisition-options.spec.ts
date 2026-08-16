import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INQUIRY_INTENT_OPTIONS,
  PARTNERSHIP_MODEL_OPTIONS,
  readAttribution,
  resolveIntentParam,
} from "./acquisition-options";

/**
 * The public acquisition forms decide two things this suite pins:
 *
 *   1. what they offer — a value the database cannot store is a submission the
 *      visitor cannot fix, and
 *   2. what they capture — attribution that is wrong is worse than attribution
 *      that is absent, because it silently misreports where customers come from.
 */

describe("resolveIntentParam", () => {
  // A Wave 2 CTA can link /plans -> /contact?intent=PRICING. The value is
  // visitor-controlled, so it is matched against the known set, never passed on.
  it("accepts a known intent", () => {
    expect(resolveIntentParam("PRICING")).toBe("PRICING");
    expect(resolveIntentParam("pricing")).toBe("PRICING");
    expect(resolveIntentParam(" Pricing ")).toBe("PRICING");
  });

  it("rejects anything it does not recognise", () => {
    expect(resolveIntentParam("QUALIFIED")).toBe("");
    expect(resolveIntentParam("<script>alert(1)</script>")).toBe("");
    expect(resolveIntentParam("")).toBe("");
    expect(resolveIntentParam(undefined)).toBe("");
    expect(resolveIntentParam(null)).toBe("");
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(resolveIntentParam(["PAYROLL", "PRICING"])).toBe("PAYROLL");
    expect(resolveIntentParam(["nonsense"])).toBe("");
  });
});

describe("readAttribution", () => {
  const origin = "https://www.dijipeople.com";

  // The landing test environment is `node` — jsdom is not installed, matching
  // apps/web. `readAttribution` only touches `window.location` and
  // `document.referrer`, so stubbing those two is enough and keeps the suite
  // dependency-free.
  function setLocation(pathname: string, search = "", referrer = "") {
    (globalThis as Record<string, unknown>).window = {
      location: { pathname, search, origin },
    };
    (globalThis as Record<string, unknown>).document = { referrer };
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  it("captures the page and any UTM parameters present", () => {
    setLocation(
      "/contact",
      "?utm_source=google&utm_medium=cpc&utm_campaign=launch-pk",
    );

    expect(readAttribution()).toEqual({
      sourcePage: "/contact",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "launch-pk",
    });
  });

  // A default would attribute organic traffic to a campaign nobody ran.
  it("omits UTM keys entirely when they are absent", () => {
    setLocation("/contact");

    const attribution = readAttribution();
    expect(attribution).toEqual({ sourcePage: "/contact" });
    expect("utmSource" in attribution).toBe(false);
    expect("referrerUrl" in attribution).toBe(false);
  });

  it("records an external referrer but not an internal one", () => {
    setLocation("/contact", "", "https://www.google.com/search?q=hr");
    expect(readAttribution().referrerUrl).toBe(
      "https://www.google.com/search?q=hr",
    );

    // Our own pages are already covered by sourcePage; recording them would
    // drown the real acquisition signal.
    setLocation("/contact", "", `${origin}/plans`);
    expect(readAttribution().referrerUrl).toBeUndefined();
  });

  it("bounds oversized values from a crafted URL", () => {
    setLocation("/contact", `?utm_source=${"x".repeat(500)}`);
    expect(readAttribution().utmSource?.length).toBe(120);
  });

  it("returns nothing during server rendering", () => {
    // No window stubbed — the afterEach above has removed it.
    expect(readAttribution()).toEqual({});
  });
});

describe("acquisition option sets", () => {
  it("gives every option a human label distinct from its stored value", () => {
    // A raw enum name rendered in a select reads as a leaked implementation
    // detail — this is what keeps SCREAMING_SNAKE out of the UI.
    for (const option of [
      ...INQUIRY_INTENT_OPTIONS,
      ...PARTNERSHIP_MODEL_OPTIONS,
      ...COMPANY_SIZE_OPTIONS,
      ...COUNTRY_OPTIONS,
    ]) {
      expect(option.label.trim().length).toBeGreaterThan(0);
      expect(option.label).not.toBe(option.value);
      expect(option.label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("uses stable country codes rather than free text", () => {
    // The previous form accepted whatever was typed, so a Lead could arrive
    // with a country of "ds".
    for (const country of COUNTRY_OPTIONS) {
      expect(country.value).toMatch(/^[A-Z]{2}$|^OTHER$/);
    }
  });

  it("has no duplicate values in any set", () => {
    for (const set of [
      INQUIRY_INTENT_OPTIONS,
      PARTNERSHIP_MODEL_OPTIONS,
      COMPANY_SIZE_OPTIONS,
      COUNTRY_OPTIONS,
    ]) {
      const values = set.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
