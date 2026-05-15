import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import { PayrollCalendarRecord } from "../payroll-run-types";
import { PayrollCalendarsManager } from "./_components/payroll-calendars-manager";

export default async function PayrollCalendarsPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYROLL_CALENDARS_READ)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to payroll calendars."
      />
    );
  }
  const calendars =
    await apiRequestJson<PayrollCalendarRecord[]>("/payroll/calendars");
  return (
    <PayrollLayoutShell
      title="Payroll Calendars"
      description="Define payroll frequency, currency, and business-unit schedule foundations."
    >
      <PayrollCalendarsManager
        calendars={calendars}
        canManage={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.PAYROLL_CALENDARS_MANAGE,
        )}
      />
    </PayrollLayoutShell>
  );
}
