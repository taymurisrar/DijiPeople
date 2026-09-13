import type { DashboardNavItem } from "@/app/(authenticated)/_components/navigation";

/*
 * Sidebar entries for published custom modules (BUG-3494 / ADR-0016).
 *
 * The fixed product list stays code-defined. Custom entries are composed into
 * it BEFORE tenant overrides are applied, keyed by href like every other entry,
 * so the Sidebar Designer's hide, order, rename and audience rules reach them
 * with no second override mechanism — and "overrides never add entries" still
 * holds, because the entries come from what the API says is published, not from
 * an override row.
 *
 * Which modules exist is decided by the API (`GET /metadata/custom-modules`):
 * published in the latest snapshot, active, and readable by the caller. This
 * file never sees drafts. The permission below is a usability affordance; the
 * data endpoints enforce the same key and matrix privilege themselves.
 */

export const CUSTOM_MODULE_ROUTE_BASE = "/custom-modules";

/*
 * Derived, not catalogued: the API builds this key from the `custom-records`
 * READ matrix privilege (`auth-access.service.ts`). Kept as one constant here
 * rather than added to `lib/security-keys.ts`, which mirrors catalogued keys.
 */
export const CUSTOM_RECORDS_READ_PERMISSION = "custom-records.read";

export type CustomModuleSummary = {
  readonly moduleKey: string;
  readonly displayName: string;
  readonly pluralDisplayName?: string | null;
  readonly icon?: string | null;
  readonly displayOrder?: number | null;
};

export function customModuleHref(moduleKey: string) {
  return `${CUSTOM_MODULE_ROUTE_BASE}/${encodeURIComponent(moduleKey)}`;
}

export function buildCustomModuleNavItems(
  modules: readonly CustomModuleSummary[] | null | undefined,
): DashboardNavItem[] {
  const seen = new Set<string>();

  return (modules ?? []).flatMap((module) => {
    const moduleKey = module.moduleKey?.trim();
    if (!moduleKey || seen.has(moduleKey)) return [];
    seen.add(moduleKey);

    const label =
      module.pluralDisplayName?.trim() ||
      module.displayName?.trim() ||
      moduleKey;

    return [
      {
        href: customModuleHref(moduleKey),
        label,
        description: "",
        requiredAnyPermissions: [CUSTOM_RECORDS_READ_PERMISSION],
      },
    ];
  });
}

/**
 * The full sidebar catalog: the fixed list with custom entries placed just
 * before Settings (the administrative tail), or appended when there is no
 * Settings entry. A custom href that collides with a fixed one is dropped —
 * the product entry wins.
 */
export function composeDashboardNavItems(
  base: readonly DashboardNavItem[],
  customItems: readonly DashboardNavItem[],
): DashboardNavItem[] {
  if (customItems.length === 0) return [...base];

  const baseHrefs = new Set(base.map((item) => item.href));
  const additions = customItems.filter((item) => !baseHrefs.has(item.href));
  const settingsIndex = base.findIndex((item) => item.href === "/settings");

  if (settingsIndex === -1) return [...base, ...additions];

  return [
    ...base.slice(0, settingsIndex),
    ...additions,
    ...base.slice(settingsIndex),
  ];
}
