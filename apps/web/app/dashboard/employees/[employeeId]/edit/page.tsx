import { apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { getDefaultForm } from "@/lib/customization-forms";
import { EmployeeForm } from "../../_components/employee-form";
import {
  EmployeeFormValues,
  EmployeeProfile,
  EmployeeListResponse,
  EmployeeRoleOption,
} from "../../types";
import { TenantResolvedSettingsResponse } from "../../../settings/types";

type EditEmployeePageProps = {
  params: Promise<{
    employeeId: string;
  }>;
};

export default async function EditEmployeePage({
  params,
}: EditEmployeePageProps) {
  const { employeeId } = await params;
  const sessionUser = await getSessionUser();
  const canManageAccess = Boolean(
    sessionUser?.permissionKeys.includes("users.create") &&
      sessionUser.permissionKeys.includes("users.assign-roles") &&
      sessionUser.permissionKeys.includes("roles.read"),
  );

  const [employee, managers, roles, resolvedSettings, runtimeForm] = await Promise.all([
    apiRequestJson<EmployeeProfile>(`/employees/${employeeId}`),
    apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
    canManageAccess
      ? apiRequestJson<EmployeeRoleOption[]>("/roles")
      : Promise.resolve([]),
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(
      () => null,
    ),
    getDefaultForm("employees", "edit"),
  ]);

  const initialValues: EmployeeFormValues = {
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    middleName: employee.middleName || "",
    lastName: employee.lastName,
    preferredName: employee.preferredName || "",
    workEmail: employee.workEmail || "",
    personalEmail: employee.personalEmail || "",
    phone: employee.phone,
    alternatePhone: employee.alternatePhone || "",
    dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.slice(0, 10) : "",
    gender: employee.gender || "",
    maritalStatus: employee.maritalStatus || "",
    nationalityCountryId: employee.nationalityCountryId || "",
    nationality: employee.nationality || "",
    cnic: employee.cnic || "",
    bloodGroup: employee.bloodGroup || "",
    employmentStatus: employee.employmentStatus,
    employeeType: employee.employeeType || "",
    workMode: employee.workMode || "",
    contractType: employee.contractType || "",
    hireDate: employee.hireDate.slice(0, 10),
    confirmationDate: employee.confirmationDate
      ? employee.confirmationDate.slice(0, 10)
      : "",
    probationEndDate: employee.probationEndDate
      ? employee.probationEndDate.slice(0, 10)
      : "",
    terminationDate: employee.terminationDate
      ? employee.terminationDate.slice(0, 10)
      : "",
    departmentId: employee.departmentId || "",
    designationId: employee.designationId || "",
    locationId: employee.locationId || "",
    officialJoiningLocationId: employee.officialJoiningLocationId || "",
    reportingManagerEmployeeId: employee.reportingManagerEmployeeId || "",
    userId: employee.userId || "",
    noticePeriodDays:
      employee.noticePeriodDays !== null && employee.noticePeriodDays !== undefined
        ? employee.noticePeriodDays
        : null,
    taxIdentifier: employee.taxIdentifier || "",
    provisionSystemAccess: Boolean(employee.user),
    sendInvitationNow: employee.user?.status !== "Active",
    initialRoleIds: employee.user?.roles.map((role) => role.id) ?? [],
    addressLine1: employee.addressLine1 || "",
    addressLine2: employee.addressLine2 || "",
    countryId: employee.countryId || "",
    stateProvinceId: employee.stateProvinceId || "",
    cityId: employee.cityId || "",
    postalCode: employee.postalCode || "",
    emergencyContactName: employee.emergencyContactName || "",
    emergencyContactRelation: employee.emergencyContactRelation || "",
    emergencyContactRelationTypeId:
      employee.emergencyContactRelationTypeId || "",
    emergencyContactPhone: employee.emergencyContactPhone || "",
    emergencyContactAlternatePhone:
      employee.emergencyContactAlternatePhone || "",
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
          Keep the core employment record accurate so future HR modules can
          rely on this data consistently.
        </p>
      </section>

      <EmployeeForm
        canManageAccess={canManageAccess}
        employeeId={employee.id}
        initialValues={initialValues}
        managerOptions={managers.items.filter((manager) => manager.id !== employee.id)}
        roleOptions={roles}
        runtimeFormLayout={runtimeForm?.layoutJson ?? null}
        settings={{
          autoGenerateEmployeeId:
            resolvedSettings?.employee.autoGenerateEmployeeId ?? false,
          requireDepartment: resolvedSettings?.employee.requireDepartment ?? false,
          requireDesignation: resolvedSettings?.employee.requireDesignation ?? false,
          requireReportingManager:
            resolvedSettings?.employee.requireReportingManager ?? false,
          requireWorkLocation: resolvedSettings?.employee.requireWorkLocation ?? false,
        }}
        mode="edit"
      />
    </main>
  );
}
