import { apiRequestJson } from "@/lib/server-api";
import type { TenantResolvedSettingsResponse } from "../settings/types";

/*
 * TASK-0036 — a new claim starts in the tenant's own currency. The form used
 * to start empty with "USD" as a placeholder, which looked filled in and then
 * refused to save ("Title and currency are required"). Server-only: the claim
 * pages call it and hand the value to the client form.
 */
export async function loadDefaultClaimCurrency(): Promise<string> {
  const settings = await apiRequestJson<TenantResolvedSettingsResponse>(
    "/tenant-settings/resolved",
  ).catch(() => null);
  return (
    settings?.organization.currency ||
    settings?.system.defaultCurrency ||
    ""
  ).toUpperCase();
}
