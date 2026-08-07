import { apiRequestJson } from "@/lib/server-api";
import { resolveBrandingSettings } from "@/lib/branding";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { TenantSettingsApiResponse, TenantSettingValue } from "../types";
import { BrandingSettingsForm } from "./_components/branding-settings-form";
import { BrandingScopeSelector } from "./_components/branding-scope-selector";

type BrandingOrganization = {
  id: string;
  name: string;
  code?: string | null;
};

type OrganizationOverridesResponse = {
  organizationId: string;
  overrides: Record<string, Record<string, TenantSettingValue>>;
};

type BrandingSettingsPageProps = {
  searchParams?: Promise<{ organizationId?: string }>;
};

export default async function BrandingSettingsPage({
  searchParams,
}: BrandingSettingsPageProps) {
  await requireSettingsPermissions(["settings.read"]);

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedOrganizationId = resolvedSearchParams.organizationId?.trim() || "";

  // A failed organization lookup must not look identical to a tenant that has
  // only one organization, or the scope selector just disappears with no
  // explanation and the feature looks broken.
  const [tenantSettings, organizationsResult] = await Promise.all([
    apiRequestJson<TenantSettingsApiResponse>("/tenant-settings"),
    apiRequestJson<BrandingOrganization[]>("/tenant-settings/organizations")
      .then((value) => ({ ok: true as const, value }))
      .catch((error: unknown) => ({
        ok: false as const,
        message:
          error instanceof Error
            ? error.message
            : "Unable to load organizations.",
      })),
  ]);

  const organizations = organizationsResult.ok ? organizationsResult.value : [];

  const activeOrganizationId = organizations.some(
    (organization) => organization.id === requestedOrganizationId,
  )
    ? requestedOrganizationId
    : "";

  // An organization stores only the keys it overrides, so the form is seeded
  // with the tenant values and the organization's overrides layered on top.
  // That way an untouched field shows what the organization actually inherits.
  const organizationOverrides = activeOrganizationId
    ? await apiRequestJson<OrganizationOverridesResponse>(
        `/tenant-settings/organizations/${encodeURIComponent(activeOrganizationId)}/settings`,
      ).catch(() => null)
    : null;

  const mergedBranding = {
    ...toStringSettingsRecord(tenantSettings.settings.branding),
    ...toStringSettingsRecord(organizationOverrides?.overrides.branding),
  };

  const initialValues = resolveBrandingSettings(mergedBranding);
  const activeOrganizationName = organizations.find(
    (organization) => organization.id === activeOrganizationId,
  )?.name;

  return (
    <SettingsShell
      eyebrow="Branding"
      title="Branding"
      description={
        activeOrganizationId
          ? `Branding for ${activeOrganizationName}. Values you change here apply only to this organization; anything you leave blank inherits from the tenant.`
          : "Set your tenant brand tokens and font for sidebar, dashboard, and employee pages. Organizations can override these individually."
      }
    >
      {!organizationsResult.ok ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          Organization branding is unavailable right now, so only the tenant
          defaults can be edited. ({organizationsResult.message})
        </div>
      ) : null}

      {organizations.length > 1 ? (
        <BrandingScopeSelector
          activeOrganizationId={activeOrganizationId}
          organizations={organizations}
        />
      ) : null}

      <BrandingSettingsForm
        initialValues={initialValues}
        key={activeOrganizationId || "tenant"}
        organizationId={activeOrganizationId || null}
        organizationName={activeOrganizationName ?? null}
      />
    </SettingsShell>
  );
}

function toStringSettingsRecord(
  source: Record<string, TenantSettingValue> | undefined,
) {
  if (!source) {
    return undefined;
  }

  const output: Partial<Record<string, string | null>> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" || value === null) {
      output[key] = value;
    }
  }

  return output;
}
