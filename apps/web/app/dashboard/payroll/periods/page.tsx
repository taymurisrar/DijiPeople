import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import {
  PayrollCalendarRecord,
  PayrollPeriodRecord,
} from "../payroll-run-types";
import { PayrollPeriodsManager } from "./_components/payroll-periods-manager";

export default async function PayrollPeriodsPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYROLL_PERIODS_READ)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to payroll periods."
      />
    );
  }
  const [calendars, periods] = await Promise.all([
    apiRequestJson<PayrollCalendarRecord[]>("/payroll/calendars"),
    apiRequestJson<PayrollPeriodRecord[]>("/payroll/periods"),
  ]);
  return (
    <PayrollLayoutShell
      title="Payroll Periods"
      description="Create and control payroll processing periods under payroll calendars."
    >
      <PayrollPeriodsManager
        calendars={calendars}
        periods={periods}
        canManage={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.PAYROLL_PERIODS_MANAGE,
        )}
      />
    </PayrollLayoutShell>
  );
}
