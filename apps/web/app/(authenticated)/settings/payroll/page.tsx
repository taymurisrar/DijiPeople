import { notFound } from "next/navigation";
import { SettingsCategoryLanding } from "../_components/settings-runtime-landing";
import { getSettingsRuntimeCategory } from "../_lib/settings-runtime";
import { getSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { AccessDeniedState } from "../../_components/access-denied-state";

const PAYROLL_SETTINGS_ACCESS = [
  "payroll.settings.read",
  "payroll-calendars.read",
  "payroll-periods.read",
  "pay-components.read",
  "claim-types.read",
  "tada-policies.read",
  "time-payroll-policies.read",
  "overtime-policies.read",
  "tax-rules.read",
  "payroll-gl.read",
  "benefits.read",
  "loans.read-all",
  "employee-bank-accounts.read",
] as const;

export default async function PayrollSettingsCategoryPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasAnyPermission(user.permissionKeys, PAYROLL_SETTINGS_ACCESS)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="Payroll and Finance settings access is required."
      />
    );
  }
  const category = getSettingsRuntimeCategory("payroll");
  if (!category) notFound();
  return <SettingsCategoryLanding category={category} />;
}
