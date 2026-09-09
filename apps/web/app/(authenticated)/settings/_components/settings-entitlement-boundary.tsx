"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { getSettingsRuntimeItemByPath } from "../_lib/settings-runtime";
import {
  isSettingsItemEntitled,
  missingCapabilityLabels,
  SETTINGS_ITEM_ENTITLEMENTS,
  SETTINGS_CORE,
  FEATURE_LABELS,
} from "../_lib/settings-entitlements";
import { useTenantEntitlements } from "../../_components/tenant-entitlements-provider";
import {
  SettingsEntitlementsUnavailableState,
  SettingsNotOnPlanState,
} from "./settings-plan-state";

/*
 * Refuse a settings URL the tenant's plan does not include, wherever it is
 * reached from.
 *
 * Hiding the tile, the group card and the row is navigation. This is the part
 * that answers a pasted link, a bookmark from before a downgrade, and a browser
 * autocomplete — the ways a page gets opened when nothing linked to it.
 *
 * ## Why this sits in the settings layout rather than on each page
 *
 * The settings tree is served from two different places. Most pages come from
 * the generic `[category]/[settingGroup]/[item]` routes — six leaf files, and
 * more if the runtime grows. The rest are purpose-built folders outside that
 * tree entirely: `settings/integrations/attendance/*`, `settings/desktop-agent`,
 * `settings/payroll/*` and a dozen others. A guard applied per page would have
 * to be added to every one of them and would be forgotten by the next page
 * somebody adds, which is exactly how the original gate came to be missing.
 *
 * Resolving from the pathname covers both shapes with one check, because
 * `getSettingsRuntimeItemByPath` already knows every route form an item
 * answers on: its derived route, its concise route and its bespoke
 * implementation route.
 *
 * ## This is a mirror, not the enforcement
 *
 * The API refuses the data (`FeatureEntitlementGuard`). This exists so a
 * blocked page explains itself instead of rendering an empty table over a
 * string of 403s.
 */
export function SettingsEntitlementBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const enabledFeatureKeys = useTenantEntitlements();
  const item = getSettingsRuntimeItemByPath(pathname ?? "/settings");

  /*
   * A path that resolves to no item is a landing page — the workspace, a
   * category or a group. Those resolve their own contents and render their own
   * states, and must pass through: gating them here would blank the
   * Configuration workspace itself the moment one capability was missing.
   */
  if (!item) return <>{children}</>;

  const entitlement = SETTINGS_ITEM_ENTITLEMENTS[item.key];

  /*
   * Core pages skip the entitlement check entirely, including the unresolved
   * branch below. Tenant Profile and Apps & Modules must stay reachable when
   * the availability call is down — Apps & Modules especially, since it is
   * where a confused administrator would go to find out what their plan
   * includes.
   */
  if (entitlement === SETTINGS_CORE) return <>{children}</>;

  if (enabledFeatureKeys === null) {
    return <SettingsEntitlementsUnavailableState />;
  }

  if (isSettingsItemEntitled(item.key, enabledFeatureKeys)) {
    return <>{children}</>;
  }

  const [missing] = missingCapabilityLabels([item.key], enabledFeatureKeys);

  return (
    <SettingsNotOnPlanState
      scopeLabel={item.label}
      capabilityLabel={
        missing ??
        (entitlement === undefined ? "a capability" : FEATURE_LABELS[entitlement])
      }
    />
  );
}
