import { unstable_noStore as noStore } from "next/cache";
import { apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { getDefaultForm } from "@/lib/customization-forms";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { EmployeeForm } from "../../_components/employee-form";
import {
  EmployeeFormValues,
  EmployeeProfile,
  EmployeeListResponse,
  EmployeeRoleOption,
} from "../../types";
import { TenantResolvedSettingsResponse } from "../../../settings/types";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { canEditEmployeeCoreProfile } from "@/lib/employee-profile-access";

type EditEmployeePageProps = {
  params: Promise<{
    employeeId: string;
  }>;
};

function toText(value: string | null | undefined) {
  return value ?? "";
}

function toDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

export default async function EditEmployeePage({
  params,
}: EditEmployeePageProps) {
  noStore();

  const { employeeId } = await params;
  const sessionUser = await getSessionUser();
  if (!canEditEmployeeCoreProfile(sessionUser)) {
    return (
      <main className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          title="You cannot edit this employee record."
          description="You do not have permission to edit this employee record."
        />
      </main>
    );
  }

  const permissionKeys = sessionUser?.permissionKeys ?? [];

  const canManageAccess =
    permissionKeys.includes(PERMISSION_KEYS.USERS_CREATE) &&
    permissionKeys.includes(PERMISSION_KEYS.USERS_ASSIGN_ROLES) &&
    permissionKeys.includes(PERMISSION_KEYS.ROLES_READ);

  const [employee, managers, roles, resolvedSettings, runtimeForm] =
    await Promise.all([
      apiRequestJson<EmployeeProfile>(`/employees/${employeeId}`),
      apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
      canManageAccess
        ? apiRequestJson<EmployeeRoleOption[]>("/roles")
        : Promise.resolve([]),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
      getDefaultForm("employees", "edit"),
    ]);

  if (employee.accessMode !== "ADMIN_MANAGE") {
    return (
      <main className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          title="You cannot edit this employee record."
          description="Your access to this employee profile is view-only."
        />
      </main>
    );
  }

  const initialValues: EmployeeFormValues = {
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    middleName: toText(employee.middleName),
    lastName: employee.lastName,
    preferredName: toText(employee.preferredName),
    workEmail: toText(employee.workEmail),
    personalEmail: toText(employee.personalEmail),
    phone: employee.phone,
    alternatePhone: toText(employee.alternatePhone),
    dateOfBirth: toDateInput(employee.dateOfBirth),
    gender: toText(employee.gender),
    maritalStatus: toText(employee.maritalStatus),
    nationalityCountryId: toText(employee.nationalityCountryId),
    nationality: toText(employee.nationality),
    cnic: toText(employee.cnic),
    bloodGroup: toText(employee.bloodGroup),
    employmentStatus: employee.employmentStatus,
    employeeType: toText(employee.employeeType),
    workMode: toText(employee.workMode),
    contractType: toText(employee.contractType),
    hireDate: toDateInput(employee.hireDate),
    confirmationDate: toDateInput(employee.confirmationDate),
    probationEndDate: toDateInput(employee.probationEndDate),
    terminationDate: toDateInput(employee.terminationDate),
    departmentId: toText(employee.departmentId),
    designationId: toText(employee.designationId),
    employeeLevelId: toText(employee.employeeLevelId),
    locationId: toText(employee.locationId),
    officialJoiningLocationId: toText(employee.officialJoiningLocationId),
    reportingManagerEmployeeId: toText(employee.reportingManagerEmployeeId),
    userId: toText(employee.userId),
    noticePeriodDays:
      employee.noticePeriodDays !== null &&
      employee.noticePeriodDays !== undefined
        ? employee.noticePeriodDays
        : null,
    taxIdentifier: toText(employee.taxIdentifier),
    provisionSystemAccess: Boolean(employee.user),
    sendInvitationNow: employee.user?.status !== "Active",
    initialRoleIds: employee.user?.roles?.map((role) => role.id) ?? [],

    addressLine1: toText(employee.addressLine1),
    addressLine2: toText(employee.addressLine2),
    countryId: toText(employee.countryId),
    stateProvinceId: toText(employee.stateProvinceId),
    cityId: toText(employee.cityId),
    postalCode: toText(employee.postalCode),

    emergencyContactName: toText(employee.emergencyContactName),
    emergencyContactRelation: toText(employee.emergencyContactRelation),
    emergencyContactRelationTypeId: toText(
      employee.emergencyContactRelationTypeId,
    ),
    emergencyContactPhone: toText(employee.emergencyContactPhone),
    emergencyContactAlternatePhone: toText(
      employee.emergencyContactAlternatePhone,
    ),
  };

  return (
    <main className="dp-theme-scope dp-employees-scope grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Edit Employee
        </p>

        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          Update {employee.fullName}
        </h3>

        <p className="mt-2 max-w-3xl text-muted">
          Keep the core employment record accurate so future HR modules can rely
          on this data consistently.
        </p>
      </section>

      <EmployeeForm
        canManageAccess={canManageAccess}
        employeeId={employee.id}
        initialValues={initialValues}
        managerOptions={(managers.items ?? []).filter(
          (manager) => manager.id !== employee.id,
        )}
        roleOptions={roles}
        runtimeFormLayout={runtimeForm?.layoutJson ?? null}
        settings={{
          autoGenerateEmployeeId:
            resolvedSettings?.employee.autoGenerateEmployeeId ?? false,
          requireDepartment:
            resolvedSettings?.employee.requireDepartment ?? false,
          requireDesignation:
            resolvedSettings?.employee.requireDesignation ?? false,
          requireReportingManager:
            resolvedSettings?.employee.requireReportingManager ?? false,
          requireWorkLocation:
            resolvedSettings?.employee.requireWorkLocation ?? false,
        }}
        mode="edit"
      />
    </main>
  );
}
