import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import type { WorkUnit } from "./_lib/work-profile-form";
import type {
  EmployeeOption,
  WorkAssignment,
  WorkProfileListItem,
} from "./_lib/work-profiles-client";
import { WorkProfilesManager } from "./_components/work-profiles-manager";

type EmployeePage = {
  items?: Array<{ id: string; fullName: string; employeeCode: string }>;
};

export default async function WorkProfilesSettingsPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.WORK_PROFILES_READ,
    PERMISSION_KEYS.WORK_PROFILES_MANAGE,
  ]);
  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.WORK_PROFILES_MANAGE,
  );

  const [units, profiles, assignments, employees] = await Promise.all([
    apiRequestJson<WorkUnit[]>("/work-profiles/units"),
    apiRequestJson<WorkProfileListItem[]>("/work-profiles"),
    // Assignments carry employee ids, so the API reserves them for managers.
    canManage
      ? apiRequestJson<WorkAssignment[]>("/work-profiles/assignments")
      : Promise.resolve<WorkAssignment[]>([]),
    // Names for the assignment list and picker; the screen works without them.
    canManage
      ? apiRequestJson<EmployeePage>("/employees?pageSize=100").catch(
          (): EmployeePage => ({ items: [] }),
        )
      : Promise.resolve<EmployeePage>({ items: [] }),
  ]);

  const employeeOptions: EmployeeOption[] = (employees.items ?? []).map(
    (employee) => ({
      id: employee.id,
      name: employee.fullName,
      code: employee.employeeCode,
    }),
  );

  return (
    <SettingsShell
      description="Define what each role does and how that work is measured."
      eyebrow="People"
      title="Work Profiles"
    >
      <WorkProfilesManager
        canManage={canManage}
        employees={employeeOptions}
        initialAssignments={assignments}
        initialProfiles={profiles}
        initialUnits={units}
      />
    </SettingsShell>
  );
}
