/*
 * The user's light/dark choice, shared by the toggle and the app-wide applier.
 *
 * Kept in one place because the choice has to be applied from two directions:
 * a script that runs before paint so the page never flashes, and a component
 * that re-applies after hydration. The second is not belt-and-braces — a
 * hydration mismatch anywhere on the page makes React regenerate the tree from
 * the server HTML, which has no theme attribute, silently reverting the page to
 * light. Browser extensions that inject into the DOM cause exactly that.
 */

export const THEME_STORAGE_KEY = "dijipeople:theme";

export type ThemeChoice = "light" | "dark" | "system";

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function readStoredThemeChoice(): ThemeChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : null;
  } catch {
    /* Storage can be blocked; that is not a reason to fail. */
    return null;
  }
}

export function storeThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* A blocked storage API must not stop the theme from changing. */
  }
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/**
 * Where the tenant's `defaultThemeMode` is published for the client.
 *
 * BUG-0046 — the tenant default used to be written straight into `data-theme`
 * by the branding client, which put it in a race with the user's own choice.
 * They are different inputs and must not share a slot: `data-theme` is the
 * *resolved answer* the stylesheet keys on, and only `applyTheme` writes it.
 */
export const TENANT_THEME_ATTRIBUTE = "data-tenant-theme";

export function readTenantThemeDefault(): ThemeChoice | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute(TENANT_THEME_ATTRIBUTE);
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

/**
 * The one precedence order: **user choice → tenant default → device.**
 *
 * Three writers previously competed for `data-theme` — the branding client, the
 * resolved-settings provider, and this module — and one of them installed a
 * MutationObserver that reverted anything it had not written back to
 * `readStoredThemeChoice() ?? "system"`. On a browser with no stored choice that
 * made a tenant default of DARK unreachable: it was written, observed, and
 * immediately overwritten with the device preference.
 *
 * Reading the tenant default here is what stops the observer fighting it.
 * "system" is still resolved to a concrete value before it reaches the document,
 * because `globals.css` keys `[data-theme="dark"]` and nothing matches a literal
 * `data-theme="system"`.
 */
export function effectiveThemeChoice(): ThemeChoice {
  return readStoredThemeChoice() ?? readTenantThemeDefault() ?? "system";
}

/**
 * Writes the resolved theme onto the document.
 *
 * The attribute lives on `<html>` because that is what the stylesheet keys on
 * and it is the one element that survives client-side navigation. Any
 * server-rendered wrapper still carrying its own `data-theme` is brought into
 * line so a stale tenant default cannot contradict the user's choice.
 */
export function applyTheme(choice: ThemeChoice): "light" | "dark" {
  const resolved = resolveTheme(choice);

  if (document.documentElement.dataset.theme !== resolved) {
    document.documentElement.dataset.theme = resolved;
  }

  document.querySelectorAll<HTMLElement>("[data-theme]").forEach((element) => {
    if (element !== document.documentElement) {
      element.dataset.theme = resolved;
    }
  });

  return resolved;
}
