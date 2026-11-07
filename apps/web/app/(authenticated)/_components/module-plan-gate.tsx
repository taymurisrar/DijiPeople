import type { ReactNode } from "react";
import { apiRequestJson } from "@/lib/server-api";
import type { FeatureKey } from "@/lib/security-keys";
import { FEATURE_LABELS } from "../settings/_lib/settings-entitlements";
import { isModuleOnPlan } from "../_lib/module-plan-gate";
import { ModuleNotOnPlanState } from "./module-not-on-plan-state";

type Availability = { enabledKeys?: string[] };

/**
 * Wraps a module's route tree (used from that module's `layout.tsx`).
 *
 * A direct or bookmarked URL to a module the plan does not include used to reach
 * a page whose data calls the API correctly refused, and the refusal surfaced as
 * the generic crash screen (DP-QA-001); a hub whose first call happened to be
 * ungated rendered in full (DP-QA-003). The decision is made here, before any
 * page runs. This is a usability layer: the API enforces the same boundary.
 */
export async function ModulePlanGate({
  featureKey,
  children,
}: {
  featureKey: FeatureKey;
  children: ReactNode;
}) {
  const availability = await apiRequestJson<Availability>(
    "/tenant-settings/features/availability",
  ).catch(() => null);

  if (!isModuleOnPlan(availability?.enabledKeys ?? null, featureKey)) {
    return <ModuleNotOnPlanState moduleLabel={FEATURE_LABELS[featureKey]} />;
  }

  return <>{children}</>;
}
