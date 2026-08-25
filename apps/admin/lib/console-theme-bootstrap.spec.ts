import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_THEME_COOKIE,
  THEME_BOOTSTRAP_SCRIPT,
} from "./console-theme-bootstrap";
import { codeOnly } from "./source-scan";

/*
 * Comments stripped: this file's own explanation of what `<body>` used to be
 * contains `bg-slate-100`, which the last assertion below asserts is gone. See
 * `source-scan.ts` — four specs have now met this.
 */
const rootLayout = codeOnly(
  readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8"),
);
const preferences = readFileSync(
  join(__dirname, "console-preferences.ts"),
  "utf8",
);

/**
 * The theme must be settled before the first paint, not after hydration.
 *
 * `ConsolePreferencesApplier` writes the theme attributes from a `useEffect`,
 * which runs after the browser has already painted — so every operator whose
 * preference was Dark got a guaranteed light flash on every full page load. The
 * component's own doc comment claimed the attributes were written "before the
 * first paint an operator notices", which was true of a client-side navigation
 * and false of every initial load.
 *
 * Three things have to hold, and each one alone is insufficient:
 *   - the preference reaches the root layout, which sits above the code that
 *     fetches it and can only learn it from a cookie;
 *   - the layout stamps what it knows;
 *   - a blocking script resolves SYSTEM, which needs `matchMedia` and therefore
 *     cannot be done on the server at all.
 *
 * A fourth thing has to hold about *where* the script goes, and it took a
 * second bug to learn: see the placement spec below.
 */
describe("theme bootstrap", () => {
  describe("the script", () => {
    it("reads the cookie the console writes", () => {
      expect(THEME_BOOTSTRAP_SCRIPT).toContain(ADMIN_THEME_COOKIE);
      expect(preferences).toContain("ADMIN_THEME_COOKIE");
      expect(preferences).toContain("document.cookie");
    });

    it("resolves the system preference, which the server cannot", () => {
      expect(THEME_BOOTSTRAP_SCRIPT).toContain("prefers-color-scheme: dark");
      expect(THEME_BOOTSTRAP_SCRIPT).toContain("dataset.adminScheme");
    });

    it("never leaves a stale preference attribute behind", () => {
      /*
       * Switching from Dark to System must *remove* `data-admin-theme`, not
       * leave it saying dark. The absence of the attribute is the third state,
       * and a stale one would pin the console to a theme the operator turned
       * off.
       */
      expect(THEME_BOOTSTRAP_SCRIPT).toContain("delete r.dataset.adminTheme");
    });

    it("survives a browser that refuses cookies or matchMedia", () => {
      // A console that renders light is the same outcome as before this
      // existed; a console that renders nothing is not.
      expect(THEME_BOOTSTRAP_SCRIPT).toContain("try{");
      expect(THEME_BOOTSTRAP_SCRIPT).toContain("catch(e){}");
    });

    it("stays small enough to inline without a second thought", () => {
      // It blocks the first paint by construction, so its cost is the paint's.
      expect(THEME_BOOTSTRAP_SCRIPT.length).toBeLessThan(600);
    });
  });

  describe("the root layout", () => {
    it("stamps the preference it can read server-side", () => {
      expect(rootLayout).toContain("data-admin-theme={theme}");
      expect(rootLayout).toContain("cookies()");
    });

    it("runs the bootstrap script as the first child of the body, never in the head", () => {
      /*
       * BUG-1261. React reconciles `<head>` position by position, and browser
       * extensions insert `<script>` elements of their own there before React
       * loads — so an inline script in `<head>` is hydrated against whatever
       * the extension put in that slot, and every console load reported a
       * mismatch of `src="chrome-extension://…"` against our `__html`.
       *
       * The first child of `<body>` still precedes the first paint, because
       * nothing below it has been parsed yet. `apps/web` met this first and its
       * layout says so in a comment; this app repeated the placement anyway,
       * which is why the rule is asserted here rather than only explained.
       */
      expect(rootLayout).toContain("THEME_BOOTSTRAP_SCRIPT");
      expect(rootLayout).not.toContain("<head>");
      expect(rootLayout).toMatch(/<body[\s\S]*?>\s*<script/);
      expect(rootLayout.indexOf('id="admin-theme-bootstrap"')).toBeLessThan(
        rootLayout.indexOf("{children}"),
      );
    });

    it("accepts that the served markup and the hydrated tree differ", () => {
      // The script edits `documentElement` before React hydrates; without this
      // React warns about a mismatch it was told to create.
      expect(rootLayout).toContain("suppressHydrationWarning");
    });

    it("does not warn about the attributes extensions stamp on the body", () => {
      // Grammarly, password managers and translation tools all write their own
      // attributes onto `<body>` before hydration. That is not a mismatch this
      // app can prevent, and a warning it cannot act on is a warning it learns
      // to ignore.
      expect(rootLayout).toMatch(
        /<body[\s\S]*?suppressHydrationWarning[\s\S]*?>/,
      );
    });

    it("paints the page background from a token, not a hardcoded light class", () => {
      /*
       * `<body>` was `bg-slate-100 text-slate-950` — on the one element outside
       * every route group, and therefore outside anything that knows the
       * preference. Even with the attribute right, the page behind the shell
       * stayed light.
       */
      expect(rootLayout).toContain("bg-[var(--admin-background)]");
      expect(rootLayout).toContain("text-[var(--admin-text)]");
      expect(rootLayout).not.toContain("bg-slate-100");
    });
  });
});
