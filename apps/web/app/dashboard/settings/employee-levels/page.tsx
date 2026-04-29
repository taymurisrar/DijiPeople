import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import {
  EmployeeLevelRecord,
  EmployeeLevelsManager,
} from "./_components/employee-levels-manager";

export default async function EmployeeLevelsPage() {
  await requireSettingsPermissions([
    PERMISSION_KEYS.EMPLOYEE_LEVELS_READ,
    PERMISSION_KEYS.EMPLOYEE_LEVELS_MANAGE,
  ]);

  const levels =
    await apiRequestJson<EmployeeLevelRecord[]>("/employee-levels");

  return (
    <SettingsShell
      description="Employee levels normalize grades for policy assignment, payroll eligibility, leave rules, claims, and future approval logic."
      eyebrow="People Settings"
      title="Employee Levels"
    >
      <EmployeeLevelsManager levels={levels} />
    </SettingsShell>
  );
}
