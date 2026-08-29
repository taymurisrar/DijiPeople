"use client";

import { formatEnumLabel } from "@/lib/formatters";
import {
  DefinitionList,
  PanelCard,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
} from "./tenant-panel-ui";
import {
  useTenantResource,
  type TenantConfigurationView,
} from "./tenant-control-plane.client";
import { TenantDomainsPanel } from "./tenant-domains-panel";

/**
 * Configuration — the workspace itself, not the HRM inside it.
 *
 * The editable workspace fields are rendered by the shared runtime form above
 * this panel. What lives here is the addressing and localization the tenant
 * resolves against, shown read-only: localization is tenant-side organization
 * configuration, and duplicating an editor for it in Platform Admin would create
 * a second place to change one setting.
 */
export function TenantConfigurationPanel({ tenantId }: { tenantId: string }) {
  const { data, loading, error, reload } =
    useTenantResource<TenantConfigurationView>(tenantId, "/configuration");

  if (loading && !data)
    return (
      <PanelCard title="Workspace addressing">
        <PanelLoading label="workspace configuration" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Workspace addressing">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  /*
   * Blank values are dropped rather than rendered as an empty row: `country`
   * has no platform default, so an unset one would otherwise read as a field
   * whose value is the empty string.
   */
  const localizationEntries = Object.entries(data.localization.values).filter(
    ([, value]) => String(value ?? "").trim().length > 0,
  );

  return (
    <div className="space-y-5">
      <PanelCard
        title="Workspace addressing"
        description="Where this tenant is reachable, and whether DNS and TLS have been confirmed."
      >
        <DefinitionList
          columns={3}
          items={[
            { label: "Workspace slug", value: data.workspace.slug },
            {
              label: "Workspace URL",
              value: data.workspace.workspaceUrl ? (
                <a
                  href={data.workspace.workspaceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-semibold text-[var(--admin-primary)] hover:underline"
                >
                  {data.workspace.workspaceUrl}
                </a>
              ) : (
                "Not provisioned"
              ),
            },
            {
              label: "Environment",
              value: (
                <StatePill
                  value={formatEnumLabel(data.workspace.environmentType)}
                  tone={
                    data.workspace.environmentType === "PRODUCTION"
                      ? "success"
                      : "warning"
                  }
                />
              ),
              hint: data.workspace.environmentGroupName
                ? `Part of the "${data.workspace.environmentGroupName}" environment group.`
                : "Which of the customer's workspaces this is. Each environment is a separate tenant with its own data.",
            },
            {
              label: "Editable after provisioning",
              value: data.workspace.editableFields
                .map((entry) => formatEnumLabel(entry))
                .join(", "),
              hint: "Technical identifiers stay fixed once the workspace is addressable.",
            },
          ]}
        />
      </PanelCard>

      {/*
        The Domains surface owns its own request and mutations. It is not a
        second copy of the read-only list that used to sit above — that list was
        replaced, so there is one place a hostname is read and changed.
      */}
      <TenantDomainsPanel tenantId={tenantId} />

      <PanelCard
        title="Localization"
        description={`Read-only. Source: ${data.localization.source}. These are tenant organization settings and are changed inside the tenant application.${
          data.localization.configured
            ? ""
            : " This tenant has not changed any of them, so these are the platform defaults."
        }`}
      >
        {localizationEntries.length ? (
          <DefinitionList
            columns={3}
            items={localizationEntries.map(([key, value]) => ({
              label: formatEnumLabel(key),
              value: String(value),
            }))}
          />
        ) : (
          <PanelEmptyState
            title="This tenant has not configured localization yet."
            description="Country, timezone, locale and currency are set by the tenant's own administrators during organization setup."
          />
        )}
      </PanelCard>
    </div>
  );
}
