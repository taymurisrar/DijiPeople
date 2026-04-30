import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { SettingsShell } from "../_components/settings-shell";
import {
  EmployeeLevelOption,
  PayComponentOption,
  TaxRuleRecord,
  TaxRulesManager,
} from "./_components/tax-rules-manager";

export default async function TaxRulesSettingsPage() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.TAX_RULES_READ)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to tax rules." />;
  }

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
        canManage={hasPermission(user.permissionKeys, PERMISSION_KEYS.TAX_RULES_MANAGE)}
        employeeLevels={employeeLevels.filter((level) => level.isActive)}
        initialRules={rules}
        payComponents={payComponents.filter((component) => component.isActive)}
      />
    </SettingsShell>
  );
}
