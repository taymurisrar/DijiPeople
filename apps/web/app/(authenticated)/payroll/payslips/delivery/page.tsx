import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import {
  PayslipDeliveryTable,
  type DeliveryPayslip,
} from "./_components/payslip-delivery-table";

export default async function PayslipDeliveryCenter() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, "payslips.read-all"))
    return (
      <AccessDeniedState
        title="Access denied"
        description="Payslip delivery access is required."
      />
    );
  const payslips = await apiRequestJson<DeliveryPayslip[]>("/payslips");
  return (
    <PayrollLayoutShell
      title="Payslip Delivery Center"
      description="Generation, provider submission, failure, regeneration, and resend status."
    >
      <div className="grid gap-4">
        <aside className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm text-foreground">
          <p className="font-semibold">Delivery status clarification</p>
          <p className="mt-1 text-muted">
            “Sent to provider” confirms that DijiPeople handed the notification
            to the configured provider. Delivery receipts are not currently
            available, so this does not confirm inbox delivery.
          </p>
        </aside>
        <PayslipDeliveryTable
          canDeliver={hasPermission(user.permissionKeys, "payslips.deliver")}
          canManage={hasPermission(user.permissionKeys, "payslips.manage")}
          payslips={payslips}
        />
      </div>
    </PayrollLayoutShell>
  );
}
