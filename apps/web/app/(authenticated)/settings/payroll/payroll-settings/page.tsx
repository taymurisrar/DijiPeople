import { apiRequestJson } from "@/lib/server-api";
import { ConfigSettingsForm } from "../../_components/config-settings-form";
import { SettingsShell } from "../../_components/settings-shell";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { payrollSettingsSections } from "../../_lib/settings-page-config";
import type { TenantSettingsResponse } from "../../types";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { PayrollSetupHealth } from "./payroll-setup-health";

type PayrollHealth = {
  completenessPercentage: number;
  ready: boolean;
  checks: Array<{ label: string; ready: boolean }>;
  missing: string[];
};

export default async function PayrollSettingsPage() {
  await requireSettingsPermissions(["settings.read", "payroll.settings.read"]);
  const [tenantSettings, health, user] = await Promise.all([
    apiRequestJson<TenantSettingsResponse>("/tenant-settings"),
    apiRequestJson<PayrollHealth>("/payroll/configuration/health"),
    getSessionUser(),
  ]);
  return (
    <SettingsShell
      description="Configure payroll defaults, compensation behavior, and cycle preferences."
      title="Payroll Settings"
    >
      <PayrollSetupHealth
        canInitialize={Boolean(
          user &&
            hasPermission(
              user.permissionKeys,
              PERMISSION_KEYS.PAYROLL_SETTINGS_UPDATE,
            ),
        )}
        initialHealth={health}
      />
      <ConfigSettingsForm
        initialSettings={tenantSettings}
        saveLabel="Save payroll settings"
        sections={payrollSettingsSections}
      />
    </SettingsShell>
  );
}
