import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import {
  GlAccountRecord,
  GlAccountsManager,
} from "./_components/gl-accounts-manager";

export default async function PayrollGlAccountsPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.PAYROLL_GL_READ,
    PERMISSION_KEYS.PAYROLL_GL_MANAGE,
  ]);
  const accounts = await apiRequestJson<GlAccountRecord[]>("/payroll/gl-accounts");
  const canManage = user.permissionKeys.includes(PERMISSION_KEYS.PAYROLL_GL_MANAGE);

  return (
    <SettingsShell
      description="Maintain tenant GL account mappings used by payroll journal exports."
      eyebrow="Payroll"
      title="Payroll GL Accounts"
    >
      <GlAccountsManager accounts={accounts} canManage={canManage} />
    </SettingsShell>
  );
}
