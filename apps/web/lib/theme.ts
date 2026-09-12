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

/**
 * BUG-3373 — mirrors the in-app choice so the *next* full page load can be
 * resolved server-side, before first paint. `localStorage` cannot cross that
 * boundary: `apps/web/app/layout.tsx` renders on the server, and the server
 * has no access to the browser's storage, only to what the request carries.
 * A cookie does. One year, matching the pattern `apps/admin` already uses for
 * the same defect class (`ADMIN_THEME_COOKIE`) — a preference that expires is
 * a flash that comes back.
 */
export const THEME_COOKIE = "dp-web-theme";

export type ThemeChoice = "light" | "dark" | "system";

export function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Narrows an arbitrary stored/cookie/attribute string to a real choice. */
export function parseThemeChoice(
  value: string | null | undefined,
): ThemeChoice | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

export function readStoredThemeChoice(): ThemeChoice | null {
  if (typeof window === "undefined") return null;
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
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
  try {
    document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* Same: a blocked cookie API leaves this load correct and only costs the
     * next full page load its head start. */
  }
}

export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/**
 * The one precedence order, as a pure function: **explicit choice → tenant
 * default → device.** Shared by `effectiveThemeChoice()` (DOM-based, client
 * only) and the root layout's server-side resolution, so there is exactly one
 * place that encodes the order rather than two copies that can disagree.
 */
export function resolveThemePrecedence(
  storedChoice: ThemeChoice | null,
  tenantDefault: ThemeChoice | null,
): ThemeChoice {
  return storedChoice ?? tenantDefault ?? "system";
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
  return parseThemeChoice(
    document.documentElement.getAttribute(TENANT_THEME_ATTRIBUTE),
  );
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
  return resolveThemePrecedence(
    readStoredThemeChoice(),
    readTenantThemeDefault(),
  );
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
