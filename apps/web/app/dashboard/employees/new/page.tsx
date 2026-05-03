import { getSessionUser } from "@/lib/auth";
import { getDefaultForm } from "@/lib/customization-forms";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../../_lib/business-unit-access";
import { TenantResolvedSettingsResponse } from "../../settings/types";
import { EmployeeForm } from "../_components/employee-form";
import {
  EmployeeFormValues,
  EmployeeListResponse,
  EmployeeRoleOption,
} from "../types";

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

  const permissionKeys = sessionUser?.permissionKeys ?? [];

  const canManageAccess =
    permissionKeys.includes(PERMISSION_KEYS.USERS_CREATE) &&
    permissionKeys.includes(PERMISSION_KEYS.USERS_ASSIGN_ROLES) &&
    permissionKeys.includes(PERMISSION_KEYS.ROLES_READ);

  const [managers, roles, resolvedSettings, runtimeForm] = await Promise.all([
    apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
    canManageAccess
      ? apiRequestJson<EmployeeRoleOption[]>("/roles")
      : Promise.resolve([]),
    apiRequestJson<TenantResolvedSettingsResponse>(
      "/tenant-settings/resolved",
    ).catch(() => null),
    getDefaultForm("employees", "create"),
  ]);

  const employeeSettings = resolvedSettings?.employee;
  const autoGenerateEmployeeId =
    employeeSettings?.autoGenerateEmployeeId === true;

  const initialValues: EmployeeFormValues = {
    employeeCode: "",
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
      (employeeSettings?.defaultEmployeeStatus as EmployeeFormValues["employmentStatus"]) ||
      "ACTIVE",
    employeeType: employeeSettings?.defaultEmploymentType || "",
    workMode: employeeSettings?.defaultWorkMode || "",
    contractType: "",
    hireDate: new Date().toISOString().slice(0, 10),
    confirmationDate: "",
    probationEndDate: "",
    terminationDate: "",
    departmentId: "",
    designationId: "",
    employeeLevelId: "",
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
          Capture the core employment profile first. Employee code behavior,
          required fields, reporting rules, and profile defaults are driven by
          tenant settings.
        </p>
      </section>

      <EmployeeForm
        canManageAccess={canManageAccess}
        initialValues={initialValues}
        managerOptions={managers.items}
        mode="create"
        roleOptions={roles}
        runtimeFormLayout={runtimeForm?.layoutJson ?? null}
        settings={{
          autoGenerateEmployeeId,
          employeeIdPrefix: employeeSettings?.employeeIdPrefix || "EMP",
          employeeIdSequenceLength:
            employeeSettings?.employeeIdSequenceLength ?? 5,
          requireDepartment: employeeSettings?.requireDepartment ?? false,
          requireDesignation: employeeSettings?.requireDesignation ?? false,
          requireReportingManager:
            employeeSettings?.requireReportingManager ?? false,
          requireWorkLocation: employeeSettings?.requireWorkLocation ?? false,
        }}
      />
    </main>
  );
}