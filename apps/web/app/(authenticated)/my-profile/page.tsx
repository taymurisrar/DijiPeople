import { redirect } from "next/navigation";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { getTableForms } from "@/lib/customization-forms";
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
import { getCurrentEmployee } from "../_lib/current-employee";
import type { TenantResolvedSettingsResponse } from "../settings/types";
import type { EmployeeListResponse, EmployeeProfile } from "../employees/types";

type MyProfilePageProps = {
  searchParams?: Promise<{ formId?: string }>;
};

const ESS_WRITABLE_FIELDS = new Set([
  "preferredName",
  "personalEmail",
  "phone",
  "alternatePhone",
  "dateOfBirth",
  "gender",
  "maritalStatus",
  "nationalityCountryId",
  "nationality",
  "bloodGroup",
  "addressLine1",
  "addressLine2",
  "countryId",
  "stateProvinceId",
  "cityId",
  "postalCode",
  "emergencyContactName",
  "emergencyContactRelation",
  "emergencyContactRelationTypeId",
  "emergencyContactPhone",
  "emergencyContactAlternatePhone",
]);

export default async function MyProfilePage({
  searchParams,
}: MyProfilePageProps) {
  const [sessionUser, currentEmployeeContext, resolvedSearchParams] =
    await Promise.all([
      getSessionUser(),
      getCurrentEmployee(),
      searchParams ?? Promise.resolve({} as { formId?: string }),
    ]);

  if (!sessionUser) redirect("/login?reason=session-expired");
  if (!currentEmployeeContext.employee) {
    return (
      <div className="grid gap-6">
        <AccessDeniedState
          description="An administrator must link this account to an Employee record."
          title="Employee profile not linked."
        />
      </div>
    );
  }

  const employeeId = currentEmployeeContext.employee.id;
  const [employee, managers, resolvedSettings, runtimeForms] =
    await Promise.all([
      apiRequestJson<EmployeeProfile>(`/employees/${employeeId}`),
      apiRequestJson<EmployeeListResponse>("/employees?pageSize=100").catch(
        () => ({
          items: [],
          meta: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
          filters: {
            search: null,
            employmentStatus: null,
            reportingManagerEmployeeId: null,
          },
        }),
      ),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
      getTableForms("employees"),
    ]);

  const elevated = employee.accessMode === "ADMIN_MANAGE";
  const hrManage = employee.accessMode === "HR_MANAGE";
  const canEditSelf =
    elevated ||
    hrManage ||
    sessionUser.permissionKeys.includes("employees.update.self");
  const fieldSecurityRules = canEditSelf
    ? buildSelfServiceFieldRules(elevated || hrManage)
    : buildReadOnlyFieldRules();
  const runtime = buildEmployeeRuntimeContext({
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
    }),
    principal: {
      userId: sessionUser.userId,
      tenantId: employee.tenantId,
      displayName: [sessionUser.firstName, sessionUser.lastName]
        .filter(Boolean)
        .join(" "),
      email: sessionUser.email,
      roleKeys: sessionUser.roleKeys,
      roles: sessionUser.roles,
      permissionKeys: sessionUser.permissionKeys,
    },
    forms: runtimeForms,
    views: [],
    recordId: employee.id,
    fieldSecurityRules,
  });
  const activeForm = resolveEmployeeRuntimeForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );
  const { EmployeeRuntimeFormWrapper } =
    await import("../employees/_components/employee-runtime-form-wrapper");

  return (
    <div className="dp-theme-scope dp-employees-scope grid gap-6">
      <EmployeeRuntimeFormWrapper
        activeForm={activeForm}
        lookupDisplayValues={mapEmployeeLookupDisplayValues(employee)}
        lookupOptions={mapEmployeeLookupOptions({
          employee,
          managers: managers.items.filter((manager) => manager.id !== employee.id),
        })}
        mode={canEditSelf ? "edit" : "detail"}
        record={mapEmployeeRecordToRuntimeValues(employee)}
        runtime={runtime}
      />
    </div>
  );
}

function buildSelfServiceFieldRules(
  allowHrFields: boolean,
): readonly FieldSecurityRule[] {
  if (allowHrFields) return [];

  return employeeFieldNames()
    .filter((fieldLogicalName) => !ESS_WRITABLE_FIELDS.has(fieldLogicalName))
    .map((fieldLogicalName) => readonlyRule(fieldLogicalName));
}

function buildReadOnlyFieldRules(): readonly FieldSecurityRule[] {
  return employeeFieldNames().map((fieldLogicalName) =>
    readonlyRule(fieldLogicalName),
  );
}

function readonlyRule(fieldLogicalName: string): FieldSecurityRule {
  return {
    id: `my-profile.${fieldLogicalName}.readonly`,
    entityLogicalName: "employee",
    fieldLogicalName,
    operation: "update",
    effect: "readonly",
    scope: "self",
    reason: "This field is managed by HR.",
  };
}

function employeeFieldNames() {
  return [
    "employeeCode",
    "firstName",
    "middleName",
    "lastName",
    "preferredName",
    "fullName",
    "workEmail",
    "personalEmail",
    "phone",
    "alternatePhone",
    "dateOfBirth",
    "gender",
    "maritalStatus",
    "nationalityCountryId",
    "nationality",
    "cnic",
    "bloodGroup",
    "hireDate",
    "status",
    "subStatus",
    "confirmationDate",
    "probationEndDate",
    "terminationDate",
    "ownerId",
    "employmentStatus",
    "reportingManagerEmployeeId",
    "departmentId",
    "designationId",
    "locationId",
    "officialJoiningLocationId",
    "employeeLevelId",
    "employeeType",
    "workMode",
    "contractType",
    "userId",
    "noticePeriodDays",
    "taxIdentifier",
    "addressLine1",
    "addressLine2",
    "countryId",
    "stateProvinceId",
    "cityId",
    "postalCode",
    "emergencyContactName",
    "emergencyContactRelation",
    "emergencyContactRelationTypeId",
    "emergencyContactPhone",
    "emergencyContactAlternatePhone",
  ] as const;
}
