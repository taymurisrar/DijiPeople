import { OperationalSettingsForm } from "@/app/_components/settings/operational-settings-form";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

export default async function TenantProvisioningSettingsPage() {
  await requireSystemAdminUser("/settings/tenant-provisioning");
  const settings = await apiRequestJson<{ tenantProvisioning?: Record<string, unknown> }>("/super-admin/platform-settings");
  return <SettingsShell title="Tenant provisioning and domains" description="Configure system workspace URLs separately from DNS and proxy readiness.">
    <OperationalSettingsForm
      title="System tenant domains"
      description="New tenants receive <slug>.<base-domain>. Mark wildcard readiness only after DNS, proxy routing, and TLS are operational."
      settingKey="tenantProvisioning"
      initialValues={{ tenantBaseDomain: "digipeople.com", defaultProtocol: "https", wildcardDnsReady: false, ...(settings.tenantProvisioning ?? {}) }}
      fields={[
        { key: "tenantBaseDomain", label: "Tenant base domain", description: "Example: digipeople.com. Do not include a protocol or wildcard prefix.", type: "text" },
        { key: "defaultProtocol", label: "Default app protocol", description: "Use HTTPS outside local development.", type: "text" },
        { key: "wildcardDnsReady", label: "Wildcard DNS / proxy ready", description: "Confirms that *.digipeople.com routing and TLS are actually configured.", type: "boolean" },
      ]}
    />
  </SettingsShell>;
}
