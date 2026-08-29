import { getSessionUser } from "@/lib/auth";
import { getTableForms } from "@/lib/customization-forms";
import { apiRequestJson } from "@/lib/server-api";
import {
  buildEmployeeRuntimeContext,
  buildEmptyEmployeeRuntimeValues,
  mapEmployeeLookupOptions,
  resolveEmployeeRuntimeForm,
  resolveTenantRuntimeConfig,
} from "@/lib/runtime";
import { AccessDeniedState } from "../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../_lib/business-unit-access";
import { TenantResolvedSettingsResponse } from "../../settings/types";
import { EmployeeListResponse } from "../types";

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams?: Promise<{ formId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedFormId = resolvedSearchParams.formId ?? "";
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <div className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not allow employee creation."
          title="Create employee is unavailable for your current business unit access."
        />
      </div>
    );
  }

  const sessionUser = await getSessionUser();
  const [managers, resolvedSettings, runtimeForms] = await Promise.all([
    apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
    apiRequestJson<TenantResolvedSettingsResponse>(
      "/tenant-settings/resolved",
    ).catch(() => null),
    getTableForms("employees"),
  ]);
  const tenantId =
    managers.items[0]?.tenantId ?? sessionUser?.tenantId ?? "current";
  const employeeRuntimeContext = buildEmployeeRuntimeContext({
    tenant: resolveTenantRuntimeConfig({
      tenantId,
      tenantSlug: "current",
      displayName: resolvedSettings?.organization.companyDisplayName,
      locale: resolvedSettings?.system.locale,
      timezone:
        resolvedSettings?.organization.timezone ||
        resolvedSettings?.system.defaultTimezone,
      dateFormat: resolvedSettings?.system.dateFormat,
      timeFormat: resolvedSettings?.system.timeFormat,
      currencyCode:
        resolvedSettings?.organization.currency ||
        resolvedSettings?.system.defaultCurrency,
      branding: {
        appTitle: resolvedSettings?.branding.appTitle ?? "DijiPeople",
        brandName: resolvedSettings?.branding.brandName ?? "DijiPeople",
        logoUrl: resolvedSettings?.branding.logoUrl,
        faviconUrl: resolvedSettings?.branding.faviconUrl,
        primaryColor: resolvedSettings?.branding.primaryColor ?? "#2563eb",
        secondaryColor: resolvedSettings?.branding.secondaryColor,
        bodyFontFamilyKey: resolvedSettings?.branding.fontFamily,
        headingFontFamilyKey: resolvedSettings?.branding.fontFamily,
        density:
          resolvedSettings?.system.uiDensity === "COMPACT"
            ? "compact"
            : resolvedSettings?.system.uiDensity === "SPACIOUS"
              ? "spacious"
              : "comfortable",
      },
    }),
    principal: {
      userId: sessionUser?.userId ?? "",
      tenantId,
      displayName: sessionUser
        ? [sessionUser.firstName, sessionUser.lastName]
            .filter(Boolean)
            .join(" ")
        : null,
      name: sessionUser
        ? [sessionUser.firstName, sessionUser.lastName]
            .filter(Boolean)
            .join(" ")
        : null,
      email: sessionUser?.email,
      roleKeys: sessionUser?.roleKeys ?? [],
      roles: sessionUser?.roles ?? [],
      permissionKeys: sessionUser?.permissionKeys ?? [],
    },
    forms: runtimeForms,
    views: [],
    employeeSettings: resolvedSettings?.employee,
  });
  const activeRuntimeForm = resolveEmployeeRuntimeForm(
    employeeRuntimeContext.metadata.forms,
    selectedFormId,
  );
  const { EmployeeRuntimeFormWrapper } =
    await import("../_components/employee-runtime-form-wrapper");

  return (
    <div className="dp-theme-scope dp-employees-scope grid gap-6">
      <EmployeeRuntimeFormWrapper
        activeForm={activeRuntimeForm}
        lookupOptions={mapEmployeeLookupOptions({
          managers: managers.items,
        })}
        mode="new"
        record={buildEmptyEmployeeRuntimeValues({
          defaultEmployeeStatus:
            resolvedSettings?.employee.defaultEmployeeStatus,
          defaultEmploymentType:
            resolvedSettings?.employee.defaultEmploymentType,
          defaultWorkMode: resolvedSettings?.employee.defaultWorkMode,
        })}
        runtime={employeeRuntimeContext}
      />
    </div>
  );
}
