import { humanizeLabel } from "./humanize-label";

/**
 * BUG-1753 — the label humaniser destroyed acronyms and ranges.
 *
 * It lowercased the whole string, replaced every hyphen and underscore with a
 * space, then capitalised each word. Company sizes rendered as "11 50" instead
 * of "11-50", industries as "It / Software", sources as "Linkedin" and
 * "Whatsapp Inquiry", a contract type as "Nda".
 *
 * Display only — stored values were always correct — and visible in every
 * dropdown in the console.
 */
describe("BUG-1753 — humanising a stored value", () => {
  describe("ranges stay ranges", () => {
    it.each([
      ["11-50", "11-50"],
      ["1-10", "1-10"],
      ["201-500", "201-500"],
      ["1000-5000", "1000-5000"],
    ])("%s", (value, expected) => {
      expect(humanizeLabel(value)).toBe(expected);
    });

    it("still splits a hyphen that separates words", () => {
      // The hyphen is only joining when it sits between digits.
      expect(humanizeLabel("PARTNER-REFERRED")).toBe("Partner Referred");
    });
  });

  describe("acronyms keep their capitals", () => {
    it.each([
      ["IT / Software", "IT / Software"],
      ["NDA", "NDA"],
      ["LINKEDIN", "LinkedIn"],
      ["WHATSAPP_INQUIRY", "WhatsApp Inquiry"],
      ["SAAS", "SaaS"],
      ["hr_manager", "HR Manager"],
      ["api_key", "API Key"],
    ])("%s", (value, expected) => {
      expect(humanizeLabel(value)).toBe(expected);
    });

    it("capitalises an acronym inside punctuation it did not split on", () => {
      expect(humanizeLabel("IT/SOFTWARE")).toBe("IT/Software");
    });
  });

  describe("ordinary values still read as before", () => {
    it.each([
      ["NEW", "New"],
      ["IN_PROGRESS", "In Progress"],
      ["manual entry", "Manual Entry"],
      ["MANUAL_ENTRY", "Manual Entry"],
      ["Facebook", "Facebook"],
    ])("%s", (value, expected) => {
      expect(humanizeLabel(value)).toBe(expected);
    });
  });

  it("returns falsy input untouched", () => {
    expect(humanizeLabel("")).toBe("");
  });

  it("does not invent capitals for a word that merely contains an acronym", () => {
    // "edit" contains "it". Matching on whole words rather than substrings is
    // the difference between a humaniser and a corrupter.
    expect(humanizeLabel("EDIT")).toBe("Edit");
    expect(humanizeLabel("SUBMITTED")).toBe("Submitted");
  });
});
