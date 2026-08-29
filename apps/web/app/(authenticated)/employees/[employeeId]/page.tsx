import { redirect } from "next/navigation";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { getTableForms } from "@/lib/customization-forms";
import { buildVisibilityPlacement } from "@/lib/runtime/visibility-placement";
import { getCurrentEmployee } from "../../_lib/current-employee";
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
import { PERMISSION_KEYS } from "@/lib/security-keys";
import type { FieldSecurityRule } from "@/lib/runtime/security-runtime.types";
import { TenantResolvedSettingsResponse } from "../../settings/types";
import type { EmployeeWorkSitesResponse } from "../../settings/integrations/attendance/_lib/types";
import { EmployeeWorkSites } from "../_components/employee-work-sites";
import { EmployeeDlpCaptures } from "../_components/employee-dlp-captures";
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
        <div className="dp-theme-scope dp-employees-scope grid gap-6">
          <AccessDeniedState
            description={`${error.status}: ${error.message}`}
            title="You cannot view this employee record."
          />
        </div>
      );
    }

    throw error;
  }

  const runtimeForms = await getTableForms("employees");
  const { employee: viewerEmployee } = await getCurrentEmployee();
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
      /*
       * The viewer's placement, so in-department / in-business-unit rules can
       * match. Sourced from the signed-in person's own employee record, never
       * from the record being viewed.
       */
      ...buildVisibilityPlacement(viewerEmployee),
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

  /*
   * Authorised work sites are an attendance concern, not an employee field, so
   * they hang off their own permissions and their own endpoint. A viewer
   * without them simply does not see the panel; the employee record still
   * renders in full.
   */
  const canReadWorkSites = sessionUser.permissionKeys.includes(
    PERMISSION_KEYS.ATTENDANCE_DEVICES_READ,
  );
  const canManageWorkSites =
    canManageEmployeeRecord(employee.accessMode) &&
    sessionUser.permissionKeys.includes(
      PERMISSION_KEYS.ATTENDANCE_DEVICES_MANAGE,
    );

  const [workSites, locations] = canReadWorkSites
    ? await Promise.all([
        apiRequestJson<EmployeeWorkSitesResponse>(
          `/integrations/attendance/employees/${employeeId}/work-sites`,
        ).catch(() => null),
        canManageWorkSites
          ? apiRequestJson<
              | {
                  items?: Array<{
                    id: string;
                    name: string;
                    isActive: boolean;
                  }>;
                }
              | Array<{ id: string; name: string; isActive: boolean }>
            >("/locations").catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ])
    : [null, { items: [] }];

  const locationOptions = Array.isArray(locations)
    ? locations
    : (locations.items ?? []);

  return (
    <div className="dp-theme-scope dp-employees-scope grid gap-6">
      <EmployeeRuntimeFormWrapper
        activeForm={activeRuntimeForm}
        lookupDisplayValues={mapEmployeeLookupDisplayValues(employee)}
        lookupOptions={mapEmployeeLookupOptions({
          employee,
        })}
        mode="detail"
        record={employeeRuntimeRecord}
        /*
         * Named here rather than left to the record header: the runtime record
         * is a mapped value bag keyed by form field, and it does not carry the
         * raw name fields the header looks for, so the page fell back to the
         * entity label and every employee read "Employees".
         */
        recordTitle={
          [employee.firstName, employee.lastName].filter(Boolean).join(" ") ||
          employee.employeeCode ||
          undefined
        }
        runtime={employeeRuntimeContext}
      />

      {workSites ? (
        <EmployeeWorkSites
          canManage={canManageWorkSites}
          data={workSites}
          employeeId={employee.id}
          locations={locationOptions}
        />
      ) : null}

      {/*
       * DLP captures for this employee (TASK-0024). The panel gates itself on the
       * server via `dlp.review` — it renders nothing for a viewer who lacks it,
       * so it is safe to mount unconditionally here.
       */}
      <EmployeeDlpCaptures employeeId={employee.id} />
    </div>
  );
}

function isUnauthorizedApiError(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}
