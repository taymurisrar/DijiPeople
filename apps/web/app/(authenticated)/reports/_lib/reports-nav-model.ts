/*
 * Which reporting section a path belongs to.
 *
 * Split out of `_components/reports-nav.tsx` so a spec can reach it: this app's
 * jest runs `testEnvironment: "node"` and matches `*.spec.ts`, and a component
 * file drags `next/link` and React in with it.
 *
 * The highlight is not cosmetic. Every route in this workspace lives beneath
 * `/reports`, so the obvious `startsWith` test leaves "Overview" lit on all
 * five pages and the highlight stops carrying information at all.
 */

export type ReportsNavItem = {
  href: string;
  label: string;
  /** Longer name for assistive technology, where the label alone is thin. */
  ariaLabel?: string;
};

/**
 * `/reports/analytics/workforce` -> `/reports/analytics`.
 *
 * Two segments, because that is the section. Comparing whole paths would fail
 * the moment the Analytics entry points at a specific surface — which it always
 * does, since "Analytics" with no surface is not a page.
 */
export function reportsNavSection(href: string): string {
  const path = href.split("?")[0];
  const segments = path.split("/").filter(Boolean);
  return `/${segments.slice(0, 2).join("/")}`;
}

/**
 * Is this nav entry the one the reader is standing on?
 *
 * `/reports` matches exactly and nothing else does, for the reason above. Every
 * other entry matches its section and anything beneath it, so a breakdown
 * change, a drill-down or a page-two link does not un-highlight the tab the
 * reader is on — the query string is ignored entirely.
 */
export function isReportsNavItemActive(
  currentPath: string,
  href: string,
): boolean {
  const target = href.split("?")[0];

  if (target === "/reports") return currentPath === "/reports";

  const section = reportsNavSection(target);
  return currentPath === section || currentPath.startsWith(`${section}/`);
}
