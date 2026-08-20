import {
  THEME_STORAGE_KEY,
  TENANT_THEME_ATTRIBUTE,
  effectiveThemeChoice,
  resolveTheme,
} from "./theme";

/*
 * BUG-0046 — a tenant's `defaultThemeMode` was unreachable.
 *
 * Three writers competed for `data-theme`, and one installed a MutationObserver
 * that reverted anything it had not written back to
 * `readStoredThemeChoice() ?? "system"`. On a browser with no stored choice a
 * tenant default of DARK was written, observed, and immediately overwritten with
 * the device preference — so the setting existed, saved, and did nothing.
 *
 * The precedence is now one function, and this is that function's contract:
 * user choice → tenant default → device. These are deliberately not rendering
 * tests; `apps/web` runs in a node environment on purpose (see jest.config.js),
 * and the defect was in the resolution order rather than in any component.
 */

type Stubs = { stored?: string | null; tenant?: string | null };

function withDom({ stored = null, tenant = null }: Stubs, run: () => void) {
  const priorWindow = (globalThis as Record<string, unknown>).window;
  const priorDocument = (globalThis as Record<string, unknown>).document;

  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null),
    },
    matchMedia: () => ({ matches: false }),
  };
  (globalThis as Record<string, unknown>).document = {
    documentElement: {
      getAttribute: (name: string) =>
        name === TENANT_THEME_ATTRIBUTE ? tenant : null,
    },
  };

  try {
    run();
  } finally {
    (globalThis as Record<string, unknown>).window = priorWindow;
    (globalThis as Record<string, unknown>).document = priorDocument;
  }
}

describe("theme precedence", () => {
  it("uses the tenant default when the user has chosen nothing", () => {
    // The exact case that was broken: no stored choice, tenant says DARK.
    withDom({ stored: null, tenant: "dark" }, () => {
      expect(effectiveThemeChoice()).toBe("dark");
    });
  });

  it("lets an explicit user choice override the tenant default", () => {
    withDom({ stored: "light", tenant: "dark" }, () => {
      expect(effectiveThemeChoice()).toBe("light");
    });
  });

  it("honours a user choice of system over a tenant default", () => {
    // "system" is a real choice, not an absence of one.
    withDom({ stored: "system", tenant: "dark" }, () => {
      expect(effectiveThemeChoice()).toBe("system");
    });
  });

  it("falls back to the device when neither is set", () => {
    withDom({ stored: null, tenant: null }, () => {
      expect(effectiveThemeChoice()).toBe("system");
    });
  });

  it("ignores a malformed tenant default rather than trusting it", () => {
    withDom({ stored: null, tenant: "midnight" }, () => {
      expect(effectiveThemeChoice()).toBe("system");
    });
  });

  it("never lets system reach the document as a literal", () => {
    /*
     * globals.css keys [data-theme="dark"] only, so a literal
     * data-theme="system" matches no rule and silently reads as light —
     * which is how a tenant default of SYSTEM used to behave.
     */
    expect(["light", "dark"]).toContain(resolveTheme("system"));
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
  });
});
