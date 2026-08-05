import { redirect } from "next/navigation";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { getTableForms } from "@/lib/customization-forms";
import { canManageEmployeeRecord } from "@/lib/employee-profile-access";
import {
  buildEmployeeRuntimeContext,
  mapEmployeeLookupDisplayValues,
  mapEmployeeLookupOptions,
  mapEmployeeRecordToRuntimeValues,
  resolveEmployeeRuntimeForm,
  resolveTenantRuntimeConfig,
  restrictRuntimePermissionKeysToReadOnly,
} from "@/lib/runtime";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import type { FieldSecurityRule } from "@/lib/runtime/security-runtime.types";
import { TenantResolvedSettingsResponse } from "../../settings/types";
import type { EmployeeProfile } from "../types";

type EmployeeDetailPageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  const { employeeId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedFormId = resolvedSearchParams.formId ?? "";
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login?reason=session-expired");
  }

  let employee: EmployeeProfile;
  let resolvedSettings: TenantResolvedSettingsResponse | null = null;
  let fieldSecurityRules: readonly FieldSecurityRule[] = [];

  try {
    [employee, resolvedSettings, fieldSecurityRules] = await Promise.all([
      apiRequestJson<EmployeeProfile>(`/employees/${employeeId}`),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
      apiRequestJson<readonly FieldSecurityRule[]>(
        "/field-security-policies/runtime-rules?entityKey=employees",
      ).catch(() => []),
    ]);
  } catch (error: unknown) {
    if (isUnauthorizedApiError(error)) {
      redirect("/login?reason=session-expired");
    }

    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <main className="dp-theme-scope dp-employees-scope grid gap-6">
          <AccessDeniedState
            description={`${error.status}: ${error.message}`}
            title="You cannot view this employee record."
          />
        </main>
      );
    }

    throw error;
  }

  const runtimeForms = await getTableForms("employees");
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
      userId: sessionUser.userId,
      tenantId: employee.tenantId,
      displayName: [sessionUser.firstName, sessionUser.lastName]
        .filter(Boolean)
        .join(" "),
      name: [sessionUser.firstName, sessionUser.lastName]
        .filter(Boolean)
        .join(" "),
      email: sessionUser.email,
      roleKeys: sessionUser.roleKeys,
      roles: sessionUser.roles,
      permissionKeys: canManageEmployeeRecord(employee.accessMode)
        ? sessionUser.permissionKeys
        : restrictRuntimePermissionKeysToReadOnly(
            sessionUser.permissionKeys,
            "employees",
          ),
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
  const employeeRuntimeRecord = {
    ...mapEmployeeRecordToRuntimeValues(employee),
    id: employee.id,
  };
  const { EmployeeRuntimeFormWrapper } =
    await import("../_components/employee-runtime-form-wrapper");

  return (
    <main className="dp-theme-scope dp-employees-scope grid gap-6">
      <EmployeeRuntimeFormWrapper
        activeForm={activeRuntimeForm}
        lookupDisplayValues={mapEmployeeLookupDisplayValues(employee)}
        lookupOptions={mapEmployeeLookupOptions({
          employee,
        })}
        mode="detail"
        record={employeeRuntimeRecord}
        runtime={employeeRuntimeContext}
      />
    </main>
  );
}

function isUnauthorizedApiError(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}
