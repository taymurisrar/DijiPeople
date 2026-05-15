import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import {
  PayComponentRecord,
  PayComponentsManager,
} from "./_components/pay-components-manager";

export default async function PayComponentsPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.PAY_COMPONENTS_READ,
    PERMISSION_KEYS.PAY_COMPONENTS_MANAGE,
  ]);
  const components =
    await apiRequestJson<PayComponentRecord[]>("/pay-components");
  const canManage = hasSettingsPermission(
    user,
    PERMISSION_KEYS.PAY_COMPONENTS_MANAGE,
  );

  return (
    <SettingsShell
      description="Configure reusable payroll line item definitions for earnings, allowances, reimbursements, deductions, taxes, and future payslip generation."
      eyebrow="Payroll Settings"
      title="Pay Components"
    >
      <PayComponentsManager canManage={canManage} components={components} />
    </SettingsShell>
  );
}
