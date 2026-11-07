import { apiRequestJson } from "@/lib/server-api";

/**
 * The feature keys the tenant's plan includes, or `null` when they could not be
 * read. `null` means "do not hide anything": the API enforces entitlements
 * itself, so a transient failure here must not strip a paid tenant's screens.
 */
export async function loadEnabledFeatureKeys(): Promise<string[] | null> {
  const availability = await apiRequestJson<{ enabledKeys?: string[] }>(
    "/tenant-settings/features/availability",
  ).catch(() => null);

  return availability?.enabledKeys ?? null;
}
