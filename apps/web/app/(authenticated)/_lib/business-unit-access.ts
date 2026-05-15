import { apiRequestJson } from "@/lib/server-api";

export type BusinessUnitAccessLevel =
  | "USER"
  | "BUSINESS_UNIT"
  | "PARENT_BU"
  | "ORGANIZATION"
  | "TENANT";

export type BusinessUnitAccessSummary = {
  userId: string;
  tenantId: string;
  businessUnitId: string;
  organizationId: string;
  effectiveAccessLevel: BusinessUnitAccessLevel;
  requiresSelfScope: boolean;
  accessibleBusinessUnitIds: string[];
  accessibleUserIds: string[];
};

export async function getBusinessUnitAccessSummary() {
  return apiRequestJson<BusinessUnitAccessSummary>("/organization-access/me").catch(
    () => null,
  );
}

export function hasBusinessUnitScope(
  access: BusinessUnitAccessSummary | null | undefined,
) {
  return Boolean(access && access.accessibleBusinessUnitIds.length > 0);
}

export function shouldEnforceSelfScope(
  access: BusinessUnitAccessSummary | null | undefined,
) {
  return Boolean(access?.requiresSelfScope);
}
