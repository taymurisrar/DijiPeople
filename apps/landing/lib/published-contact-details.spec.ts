import { contactInfo } from "../app/_components/marketing/content";

/*
 * BUG-1306 — the site footer published `+1 (312) 555-0184` as a live `tel:`
 * link on every page. That is a US number for a company that bills in QAR, and
 * it comes from the `555-0100`–`555-0199` block reserved for fictional use, so
 * it could never connect.
 *
 * The cause was one constant serving two purposes: the example number inside
 * the phone input, and the number published in the footer. It was correct for
 * the first and had never been replaced for the second.
 *
 * These assert the *rule* rather than the current value, so setting a real
 * number later is not a test change — only publishing an unreachable one is.
 */

/** The ranges telephone authorities reserve so nobody can be called. */
const RESERVED_FICTIONAL = [
  /\b555-?01\d\d\b/, // NANP (US/Canada) — 555-0100 to 555-0199
  /\b0000\s?0000\b/, // all-zero subscriber numbers
];

describe("published contact details", () => {
  it("never publishes a number from a reserved fictional range", () => {
    if (!contactInfo.phone) return; // Publishing nothing is a valid answer.

    for (const reserved of RESERVED_FICTIONAL) {
      expect(contactInfo.phone).not.toMatch(reserved);
    }
  });

  /*
   * The placeholder is exempt by design — it exists to be illustrative, and a
   * reserved range is the correct choice for one. This test's job is to keep
   * the two fields distinct, because collapsing them back into one is exactly
   * how the bug happened.
   */
  it("keeps the illustrative placeholder separate from the published number", () => {
    expect(contactInfo.phonePlaceholder).toBeTruthy();
    expect(contactInfo.phone).not.toBe(contactInfo.phonePlaceholder);
  });

  it("publishes contact emails that are real addresses", () => {
    for (const email of [contactInfo.businessEmail, contactInfo.supportEmail]) {
      expect(email).toMatch(/^[^@\s]+@dijipeople\.com$/);
      expect(email).not.toMatch(/example\.(com|org)$/);
    }
  });
});
