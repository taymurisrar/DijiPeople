import { unstable_noStore as noStore } from "next/cache";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { getTableForms } from "@/lib/customization-forms";
import {
  canEditEmployeeCoreProfile,
  canManageEmployeeRecord,
} from "@/lib/employee-profile-access";
import {
  buildEmployeeRuntimeContext,
  mapEmployeeLookupDisplayValues,
  mapEmployeeLookupOptions,
  mapEmployeeRecordToRuntimeValues,
  resolveEmployeeRuntimeForm,
  resolveTenantRuntimeConfig,
} from "@/lib/runtime";
import type { FieldSecurityRule } from "@/lib/runtime/security-runtime.types";
import { apiRequestJson } from "@/lib/server-api";
import { TenantResolvedSettingsResponse } from "../../../settings/types";
import { EmployeeListResponse, EmployeeProfile } from "../../types";

type EditEmployeePageProps = {
  params: Promise<{
    employeeId: string;
  }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function EditEmployeePage({
  params,
  searchParams,
}: EditEmployeePageProps) {
  noStore();

  const { employeeId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedFormId = resolvedSearchParams.formId ?? "";
  const sessionUser = await getSessionUser();

  if (!canEditEmployeeCoreProfile(sessionUser)) {
    return (
      <main className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          description="You do not have permission to edit this employee record."
          title="You cannot edit this employee record."
        />
      </main>
    );
  }

  const [employee, managers, resolvedSettings, runtimeForms, fieldSecurityRules] =
    await Promise.all([
      apiRequestJson<EmployeeProfile>(`/employees/${employeeId}`),
      apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
      getTableForms("employees"),
      apiRequestJson<readonly FieldSecurityRule[]>(
        "/field-security-policies/runtime-rules?entityKey=employees",
      ).catch(() => []),
    ]);

  if (!canManageEmployeeRecord(employee.accessMode)) {
    return (
      <main className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          description="Your access to this employee profile is view-only."
          title="You cannot edit this employee record."
        />
      </main>
    );
  }

  const employeeRuntimeContext = buildEmployeeRuntimeContext({
    tenant: resolveTenantRuntimeConfig({
      tenantId: employee.tenantId,
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
      tenantId: employee.tenantId,
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
    recordId: employee.id,
    employeeSettings: resolvedSettings?.employee,
    fieldSecurityRules,
  });
  const activeRuntimeForm = resolveEmployeeRuntimeForm(
    employeeRuntimeContext.metadata.forms,
    selectedFormId,
  );
  const { EmployeeRuntimeFormWrapper } =
    await import("../../_components/employee-runtime-form-wrapper");

  return (
    <main className="dp-theme-scope dp-employees-scope grid gap-6">
      <EmployeeRuntimeFormWrapper
        activeForm={activeRuntimeForm}
        lookupDisplayValues={mapEmployeeLookupDisplayValues(employee)}
        lookupOptions={mapEmployeeLookupOptions({
          employee,
          managers: (managers.items ?? []).filter(
            (manager) => manager.id !== employee.id,
          ),
        })}
        mode="edit"
        record={mapEmployeeRecordToRuntimeValues(employee)}
        runtime={employeeRuntimeContext}
      />
    </main>
  );
}
