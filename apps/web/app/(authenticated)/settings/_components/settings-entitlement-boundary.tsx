"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { getSettingsRuntimeItemByPath } from "../_lib/settings-runtime";
import { resolveSettingsEntitlementVerdict } from "../_lib/settings-entitlements";
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
 * tree entirely: `settings/integrations/attendance/*`, `settings/subscription`,
 * `settings/payroll/*` and a dozen others. A guard applied per page would have
 * to be added to every one of them and would be forgotten by the next page
 * somebody adds, which is how the original gate came to be missing.
 *
 * Resolving from the pathname covers both shapes with one check, because
 * `getSettingsRuntimeItemByPath` already knows every route form an item answers
 * on: its derived route, its concise route and its bespoke implementation route.
 *
 * ## This is a mirror, not the enforcement
 *
 * The API refuses the data (`EntitlementGuard`). This exists so a blocked page
 * explains itself instead of rendering an empty table over a string of 403s.
 *
 * The decision itself lives in `resolveSettingsEntitlementVerdict`, which is a
 * pure function with its own tests. This component only resolves the pathname
 * and picks a component, so nothing testable is trapped inside a hook.
 */
export function SettingsEntitlementBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const enabledFeatureKeys = useTenantEntitlements();
  const item = getSettingsRuntimeItemByPath(pathname ?? "/settings");
  const verdict = resolveSettingsEntitlementVerdict(
    item?.key ?? null,
    enabledFeatureKeys,
  );

  if (verdict.kind === "UNRESOLVED") {
    return <SettingsEntitlementsUnavailableState />;
  }

  if (verdict.kind === "NOT_ON_PLAN") {
    return (
      <SettingsNotOnPlanState
        scopeLabel={item?.label ?? "This page"}
        capabilityLabel={verdict.capabilityLabel}
      />
    );
  }

  return <>{children}</>;
}
