import { ADMIN_THEME_COOKIE } from "./console-theme-bootstrap";

/**
 * Personal console preferences, and what it means to apply one.
 *
 * The previous implementation stored these and never read them: choosing
 * Compact wrote a value into `localStorage` and nothing on screen changed. So
 * this module owns both halves — the shape, and the act of making the document
 * reflect it — and the shape mirrors the API's `UpdatePlatformPreferencesDto`
 * so the two cannot describe different preferences.
 */

export type ConsoleTheme = "SYSTEM" | "LIGHT" | "DARK";
export type ConsoleDensity = "COMFORTABLE" | "COMPACT";

export type ConsolePreferences = {
  uiTheme: ConsoleTheme;
  uiDensity: ConsoleDensity;
  defaultLandingRoute: string;
  defaultDashboardView?: string;
};

export const DEFAULT_PREFERENCES: ConsolePreferences = {
  uiTheme: "SYSTEM",
  uiDensity: "COMFORTABLE",
  defaultLandingRoute: "/",
};

/**
 * The routes an operator may choose to land on.
 *
 * An allow-list, mirroring `LANDING_ROUTES` on the API. Both sides validate:
 * the client so the control cannot offer something invalid, the server because
 * the client is not where security decisions are made. A free-text landing
 * route would be an open redirect wearing a settings form.
 */
export const LANDING_ROUTE_OPTIONS = [
  { value: "/", label: "Dashboard" },
  { value: "/leads", label: "Leads" },
  { value: "/customers", label: "Customers" },
  { value: "/onboarding", label: "Onboarding" },
  { value: "/tenants", label: "Tenants" },
  { value: "/subscriptions", label: "Subscriptions" },
  { value: "/invoices", label: "Invoices" },
  { value: "/support/cases", label: "Support cases" },
  { value: "/contracts", label: "Contracts" },
] as const;

export function isKnownLandingRoute(value: string | null | undefined) {
  return LANDING_ROUTE_OPTIONS.some((option) => option.value === value);
}

/**
 * Make the document reflect the preferences.
 *
 * Written as data attributes on `<html>` rather than classes, because the
 * admin stylesheet keys on them and an attribute cannot be accidentally
 * removed by a component that rewrites `className`. `SYSTEM` clears the
 * attribute entirely so the media query applies, which is different from
 * writing `light` — that would pin the console to light on a machine set to
 * dark, and pinning is what the other two options are for.
 */
export function applyConsolePreferences(preferences: ConsolePreferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (preferences.uiTheme === "SYSTEM") {
    delete root.dataset.adminTheme;
  } else {
    root.dataset.adminTheme = preferences.uiTheme.toLowerCase();
  }

  root.dataset.adminDensity = preferences.uiDensity.toLowerCase();
  applyResolvedScheme(preferences.uiTheme);
  writeThemeCookie(preferences.uiTheme);
}

/**
 * Mirror the preference into a cookie the root layout can read.
 *
 * The layout that renders `<html>` sits outside the `(internal)` route group,
 * above the code that fetches preferences from the API, so it has no way to ask
 * what theme this operator chose — and without it every dark-preference
 * operator got a light first paint on every full page load.
 *
 * A rendering hint, not a decision: nothing is authorised from it, so a forged
 * value costs the forger a wrongly-coloured page. `SameSite=Lax` and a year,
 * because a preference that expires is a flash that comes back.
 */
function writeThemeCookie(theme: ConsoleTheme) {
  if (typeof document === "undefined") return;
  const value = theme.toLowerCase();
  document.cookie = `${ADMIN_THEME_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The scheme actually in force, written as its own attribute.
 *
 * `data-admin-theme` is a *preference* with three values, one of which defers
 * to the machine. That is right for storage and wrong for styling: every dark
 * rule would have to be written twice — once under `[data-admin-theme="dark"]`
 * and once inside a media query guarded by `:not([data-admin-theme="light"])`
 * — and a pair of rules kept in step by hand across a stylesheet is a pair of
 * rules that drifts.
 *
 * Resolving here means the stylesheet has one selector to key on. The
 * preference attribute is deliberately left in place: it is what the settings
 * form reads back, and it is what a no-JavaScript render still exposes.
 */
export function applyResolvedScheme(theme: ConsoleTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.adminScheme = resolveScheme(theme, prefersDark);
}

/** Pure, so the three-state resolution can be asserted without a browser. */
export function resolveScheme(
  theme: ConsoleTheme,
  prefersDark: boolean,
): "light" | "dark" {
  if (theme === "DARK") return "dark";
  if (theme === "LIGHT") return "light";
  return prefersDark ? "dark" : "light";
}

/**
 * Follow the machine while the preference is SYSTEM.
 *
 * Without this, choosing SYSTEM resolves once at load and then lies for the
 * rest of the session — a laptop that switches to dark at sunset leaves the
 * console light until the next reload. Returns its own unsubscribe.
 */
export function watchSystemScheme(getTheme: () => ConsoleTheme) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyResolvedScheme(getTheme());
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
