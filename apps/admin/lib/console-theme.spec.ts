import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveScheme } from "./console-preferences";

/**
 * The console theme, which for a long time was a setting and not a theme.
 *
 * `data-admin-theme` was written correctly and the stylesheet did nothing with
 * it but set `color-scheme: dark`. That repaints scrollbars, the date picker
 * and a select's dropdown — everything the *browser* draws — and repaints
 * nothing this console draws, because every surface here is a hardcoded light
 * utility. Choosing Dark produced dark form-control internals on a white app.
 *
 * Two things are asserted: that the three-value preference resolves to a
 * two-value scheme, and that the stylesheet actually repaints something when it
 * does. The second is a structural check on `globals.css` rather than a render,
 * because `apps/admin` jest has no jsdom — and it is exactly the check that
 * would have failed against the original "theme".
 */
describe("console theme", () => {
  describe("resolution", () => {
    it("pins dark and light regardless of the machine", () => {
      expect(resolveScheme("DARK", false)).toBe("dark");
      expect(resolveScheme("LIGHT", true)).toBe("light");
    });

    it("follows the machine on SYSTEM", () => {
      /*
       * The third state is the reason the preference cannot be a boolean:
       * "light" and "follow a machine that is currently light" look identical
       * today and differ tonight.
       */
      expect(resolveScheme("SYSTEM", true)).toBe("dark");
      expect(resolveScheme("SYSTEM", false)).toBe("light");
    });
  });

  describe("stylesheet", () => {
    const css = readFileSync(
      join(__dirname, "..", "app", "globals.css"),
      "utf8",
    );
    const darkRules = css
      .split("\n")
      .filter((line) => line.includes('[data-admin-scheme="dark"]'));

    it("keys on the resolved scheme, not on the three-value preference", () => {
      /*
       * Keying on the preference means writing every dark rule twice — once
       * under the attribute and once inside a media query guarded by
       * `:not([data-admin-theme="light"])`. Two lists kept in step by hand is
       * two lists that drift.
       */
      expect(darkRules.length).toBeGreaterThan(10);
    });

    it("repaints surfaces, borders and text, not only color-scheme", () => {
      const dark = css.slice(css.indexOf('[data-admin-scheme="dark"]'));
      /*
       * The original defect, stated as an assertion. `color-scheme` alone is
       * not a theme: it is a request to the browser about widgets it owns.
       */
      for (const utility of [
        "bg-white",
        "bg-slate-50",
        "border-slate-200",
        "text-slate-950",
        "text-slate-500",
      ]) {
        expect(dark).toContain(`[class~="${utility}"]`);
      }
    });

    it("inverts the text scale rather than shifting it", () => {
      /*
       * `text-slate-950` is the darkest ink on a light page and must become the
       * *brightest* text on a dark one. Mapping it to another dark value leaves
       * headings receding behind the body copy beneath them.
       */
      const headingRule = css.slice(
        css.indexOf('[class~="text-slate-950"]'),
        css.indexOf('[class~="text-slate-950"]') + 200,
      );
      expect(headingRule).toMatch(/#f1f5f9|#f8fafc|#fff/i);
    });

    it("keeps the contract sheet white, because a contract is paper", () => {
      /*
       * The one deliberate exception. What a template author sees has to be
       * what the counterparty receives; a dark-rendered agreement is a preview
       * of a document that does not exist.
       */
      const sheet = css.slice(css.indexOf(".contract-document-sheet"));
      expect(sheet).toContain("#ffffff");
    });
  });
});
