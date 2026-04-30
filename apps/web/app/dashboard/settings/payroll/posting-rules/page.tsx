import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import {
  GlAccountOption,
  PayComponentOption,
  PostingRuleRecord,
  PostingRulesManager,
  TaxRuleOption,
} from "./_components/posting-rules-manager";

export default async function PayrollPostingRulesPage() {
  const user = await requireSettingsPermissions([
    PERMISSION_KEYS.PAYROLL_GL_READ,
    PERMISSION_KEYS.PAYROLL_GL_MANAGE,
  ]);
  const [rules, accounts, payComponents, taxRules] = await Promise.all([
    apiRequestJson<PostingRuleRecord[]>("/payroll/posting-rules"),
    apiRequestJson<GlAccountOption[]>("/payroll/gl-accounts"),
    apiRequestJson<PayComponentOption[]>("/pay-components"),
    apiRequestJson<TaxRuleOption[]>("/tax-rules"),
  ]);
  const canManage = user.permissionKeys.includes(PERMISSION_KEYS.PAYROLL_GL_MANAGE);

  return (
    <SettingsShell
      description="Map payroll line items to debit and credit accounts for journal generation."
      eyebrow="Payroll"
      title="Payroll Posting Rules"
    >
      <PostingRulesManager
        accounts={accounts.filter((account) => account.isActive)}
        canManage={canManage}
        payComponents={payComponents.filter((component) => component.isActive)}
        rules={rules}
        taxRules={taxRules.filter((rule) => rule.isActive)}
      />
    </SettingsShell>
  );
}
