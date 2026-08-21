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
}
