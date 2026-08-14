"use client";

import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { formatDate, formatEnumLabel } from "@/lib/formatters";
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

type Domain = TenantConfigurationView["workspace"]["domains"][number];

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

  const localizationEntries = Object.entries(data.localization.values);

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
              label: "Editable after provisioning",
              value: data.workspace.editableFields
                .map((entry) => formatEnumLabel(entry))
                .join(", "),
              hint: "Technical identifiers stay fixed once the workspace is addressable.",
            },
          ]}
        />
        <div className="mt-5">
          {data.workspace.domains.length ? (
            <ProDataTable
              rows={data.workspace.domains}
              rowKey={(row) => row.id}
              compact
              columns={domainColumns}
            />
          ) : (
            <PanelEmptyState
              title="No workspace domain has been reserved."
              description="Provisioning reserves the workspace subdomain. Retry provisioning from Operations if this is unexpected."
            />
          )}
        </div>
      </PanelCard>

      <PanelCard
        title="Localization"
        description={`Read-only. Source: ${data.localization.source}. These are tenant organization settings and are changed inside the tenant application.`}
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

const domainColumns: ProDataTableColumn<Domain>[] = [
  {
    key: "domain",
    header: "Domain",
    minWidth: 220,
    render: (row) => (
      <span className="break-all font-medium text-slate-900">{row.domain}</span>
    ),
  },
  {
    key: "type",
    header: "Type",
    minWidth: 160,
    render: (row) => formatEnumLabel(row.type),
  },
  {
    key: "isPrimary",
    header: "Primary",
    minWidth: 110,
    render: (row) =>
      row.isPrimary ? (
        <StatePill value="Primary" tone="success" />
      ) : (
        <span className="text-xs text-slate-500">Secondary</span>
      ),
  },
  {
    key: "verificationStatus",
    header: "DNS",
    minWidth: 130,
    render: (row) => (
      <StatePill
        value={row.verificationStatus}
        tone={
          row.verificationStatus === "VERIFIED"
            ? "success"
            : row.verificationStatus === "FAILED"
              ? "danger"
              : "warning"
        }
      />
    ),
  },
  {
    key: "sslStatus",
    header: "TLS",
    minWidth: 130,
    render: (row) =>
      row.sslStatus ? (
        <StatePill
          value={row.sslStatus}
          tone={row.sslStatus === "ACTIVE" ? "success" : "warning"}
        />
      ) : (
        <span className="text-xs text-slate-500">Not checked</span>
      ),
  },
  {
    key: "verifiedAt",
    header: "Verified",
    minWidth: 140,
    render: (row) => (row.verifiedAt ? formatDate(row.verifiedAt) : "—"),
  },
];
