import { apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../../_lib/business-unit-access";
import { EmployeeForm } from "../_components/employee-form";
import {
  EmployeeFormValues,
  EmployeeListResponse,
  EmployeeRoleOption,
} from "../types";
import { TenantResolvedSettingsResponse } from "../../settings/types";

export default async function NewEmployeePage() {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not allow employee creation."
          title="Create employee is unavailable for your current business unit access."
        />
      </main>
    );
  }

  const sessionUser = await getSessionUser();
  const canManageAccess = Boolean(
    sessionUser?.permissionKeys.includes("users.create") &&
      sessionUser.permissionKeys.includes("users.assign-roles") &&
      sessionUser.permissionKeys.includes("roles.read"),
  );
  const [managers, roles, resolvedSettings] = await Promise.all([
    apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
    canManageAccess
      ? apiRequestJson<EmployeeRoleOption[]>("/roles")
      : Promise.resolve([]),
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(
      () => null,
    ),
  ]);

  const initialValues: EmployeeFormValues = {
    employeeCode:
      resolvedSettings?.employee.autoGenerateEmployeeId === true
        ? `${resolvedSettings.employee.employeeIdPrefix || "EMP"}-AUTO`
        : "",
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    workEmail: "",
    personalEmail: "",
    phone: "",
    alternatePhone: "",
    dateOfBirth: "",
    gender: "",
    maritalStatus: "",
    nationalityCountryId: "",
    nationality: "",
    cnic: "",
    bloodGroup: "",
    employmentStatus:
      (resolvedSettings?.employee.defaultEmployeeStatus as EmployeeFormValues["employmentStatus"]) ||
      "ACTIVE",
    employeeType: resolvedSettings?.employee.defaultEmploymentType || "",
    workMode: resolvedSettings?.employee.defaultWorkMode || "",
    contractType: "",
    hireDate: new Date().toISOString().slice(0, 10),
    confirmationDate: "",
    probationEndDate: "",
    terminationDate: "",
    departmentId: "",
    designationId: "",
    locationId: "",
    officialJoiningLocationId: "",
    reportingManagerEmployeeId: "",
    userId: "",
    noticePeriodDays: null,
    taxIdentifier: "",
    provisionSystemAccess: false,
    sendInvitationNow: true,
    initialRoleIds: [],
    addressLine1: "",
    addressLine2: "",
    countryId: "",
    stateProvinceId: "",
    cityId: "",
    postalCode: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactRelationTypeId: "",
    emergencyContactPhone: "",
    emergencyContactAlternatePhone: "",
  };

  return (
    <main className="dp-theme-scope dp-employees-scope grid gap-6">
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Create Employee
        </p>
        <h3 className="mt-3 text-3xl font-semibold text-foreground">
          Add a new employee record
        </h3>
        <p className="mt-2 max-w-3xl text-muted">
          Capture the core employment profile first. Future modules can attach
          hierarchy, leave, attendance, and payroll configuration later.
        </p>
      </section>

      <EmployeeForm
        canManageAccess={canManageAccess}
        initialValues={initialValues}
        managerOptions={managers.items}
        roleOptions={roles}
        settings={{
          autoGenerateEmployeeId:
            resolvedSettings?.employee.autoGenerateEmployeeId ?? false,
          requireDepartment: resolvedSettings?.employee.requireDepartment ?? false,
          requireDesignation: resolvedSettings?.employee.requireDesignation ?? false,
          requireReportingManager:
            resolvedSettings?.employee.requireReportingManager ?? false,
          requireWorkLocation: resolvedSettings?.employee.requireWorkLocation ?? false,
        }}
        mode="create"
      />
    </main>
  );
}
