import { getPlatformDomainConfig } from "@repo/config";
import { OperationalSettingsForm } from "@/app/_components/settings/operational-settings-form";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

/**
 * Workspace routing settings.
 *
 * The base domain and protocol used to be editable here and stored in the
 * database. They are not any more: the request router that maps a hostname to a
 * tenant runs at the edge with no database access and reads them from
 * configuration, so an operator editing them here would change the display and
 * nothing else. They are shown read-only, sourced from the same configuration
 * the router uses.
 *
 * `wildcardDnsReady` genuinely belongs in the database — it is an operator's
 * assertion that DNS, proxy routing and TLS are live, and until it is set no
 * workspace subdomain is marked verified.
 */
export default async function TenantProvisioningSettingsPage() {
  await requireSystemAdminUser("/settings/tenant-provisioning");
  const settings = await apiRequestJson<{
    tenantProvisioning?: Record<string, unknown>;
  }>("/super-admin/platform-settings");
  const routing = getPlatformDomainConfig();

  return (
    <SettingsShell
      title="Tenant provisioning and domains"
      description="Workspace addressing is configured through the environment; DNS readiness is asserted here."
    >
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Resolved workspace addressing
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Read-only. These come from this deployment&apos;s configuration and are
          what the request router actually matches on. Change them by changing
          the environment, not here.
        </p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Platform environment", routing.platformEnvironment],
            ["Tenant base domain", routing.tenantBaseDomain || "Not configured"],
            ["Default protocol", routing.protocol],
            ["Workspace URL pattern", routing.tenantBaseDomain
              ? `${routing.protocol}://<slug>.${routing.tenantBaseDomain}`
              : "Unavailable until a base domain is configured"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 break-all font-medium text-slate-900">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <OperationalSettingsForm
        title="Wildcard DNS readiness"
        description="Enable only after the wildcard DNS record, proxy routing and TLS certificate for the base domain above are all operational. Workspace subdomains stay pending until this is confirmed."
        settingKey="tenantProvisioning"
        /*
         * Only the one key. Seeding from the whole stored object would carry the
         * retired tenantBaseDomain/defaultProtocol values forward on every save,
         * keeping a dead setting alive for the next reader to trust.
         */
        initialValues={{
          wildcardDnsReady:
            settings.tenantProvisioning?.wildcardDnsReady === true,
        }}
        fields={[
          {
            key: "wildcardDnsReady",
            label: "Wildcard DNS / proxy / TLS ready",
            description: `Confirms that *.${routing.tenantBaseDomain || "<base domain>"} routing and TLS are configured. Marking this without verifying it puts tenants on hostnames that do not answer.`,
            type: "boolean",
          },
        ]}
      />
    </SettingsShell>
  );
}
