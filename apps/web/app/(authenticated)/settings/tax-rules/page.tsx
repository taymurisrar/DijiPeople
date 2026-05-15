import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasSettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import {
  EmployeeLevelOption,
  PayComponentOption,
  TaxRuleRecord,
  TaxRulesManager,
} from "./_components/tax-rules-manager";

export default async function TaxRulesSettingsPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.TAX_RULES_READ,
  ]);

  const [rules, payComponents, employeeLevels] = await Promise.all([
    apiRequestJson<TaxRuleRecord[]>("/tax-rules"),
    apiRequestJson<PayComponentOption[]>("/pay-components"),
    apiRequestJson<EmployeeLevelOption[]>("/employee-levels"),
  ]);

  return (
    <SettingsShell
      description="Configure effective-dated, tenant-scoped tax deductions and employer contribution rules."
      eyebrow="Payroll"
      title="Tax Rules"
    >
      <TaxRulesManager
        canManage={hasSettingsPermission(
          user,
          PERMISSION_KEYS.TAX_RULES_MANAGE,
        )}
        employeeLevels={employeeLevels.filter((level) => level.isActive)}
        initialRules={rules}
        payComponents={payComponents.filter((component) => component.isActive)}
      />
    </SettingsShell>
  );
}
