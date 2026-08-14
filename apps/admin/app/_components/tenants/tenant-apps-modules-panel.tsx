"use client";

import { useState } from "react";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { formatDate, formatEnumLabel } from "@/lib/formatters";
import {
  DefinitionList,
  DialogField,
  PanelButton,
  PanelCard,
  PanelDialog,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
  dialogInputClass,
  relativeTime,
} from "./tenant-panel-ui";
import {
  describeError,
  tenantRequest,
  useTenantResource,
  type TenantApp,
  type TenantAppsView,
  type TenantGateway,
  type TenantInstallation,
  type TenantModule,
  type TenantModulesView,
  type TenantRelease,
} from "./tenant-control-plane.client";

const MODULE_STATE_TONE: Record<
  TenantModule["state"],
  "success" | "neutral" | "warning" | "danger" | "info"
> = {
  ENABLED_BY_PLAN: "success",
  DISABLED_BY_PLAN: "neutral",
  ENABLED_BY_OVERRIDE: "info",
  DISABLED_BY_OVERRIDE: "warning",
  BLOCKED_BY_PLAN: "danger",
};

const MODULE_STATE_LABEL: Record<TenantModule["state"], string> = {
  ENABLED_BY_PLAN: "Enabled by plan",
  DISABLED_BY_PLAN: "Disabled by plan",
  ENABLED_BY_OVERRIDE: "Enabled by override",
  DISABLED_BY_OVERRIDE: "Disabled by override",
  BLOCKED_BY_PLAN: "Blocked by plan",
};

const UPDATE_STATUS_TONE: Record<
  string,
  "success" | "neutral" | "warning" | "danger" | "info"
> = {
  UP_TO_DATE: "success",
  UPDATE_AVAILABLE: "warning",
  BELOW_MINIMUM: "danger",
  NOT_INSTALLED: "neutral",
  NOT_APPLICABLE: "neutral",
  UNKNOWN: "neutral",
};

const HEALTH_TONE: Record<
  string,
  "success" | "neutral" | "warning" | "danger" | "info"
> = {
  ONLINE: "success",
  STALE: "warning",
  OFFLINE: "danger",
  NEVER_CONNECTED: "neutral",
  REVOKED: "danger",
  NOT_INSTALLED: "neutral",
  UNAVAILABLE: "warning",
};

/**
 * Apps & Modules — the tenant-level control centre for DijiPeople capability.
 *
 * Modules are entitlement: what the plan sells and what the tenant is allowed to
 * turn on. Apps are software: what is actually installed, on what version, and
 * whether it is reporting in. They are different questions with different data,
 * so they are separate sections rather than one table of everything.
 */
export function TenantAppsModulesPanel({ tenantId }: { tenantId: string }) {
  return (
    <div className="space-y-5">
      <TenantModulesSection tenantId={tenantId} />
      <TenantAppsSection tenantId={tenantId} />
    </div>
  );
}

function TenantModulesSection({ tenantId }: { tenantId: string }) {
  const { data, loading, error, reload, setData } =
    useTenantResource<TenantModulesView>(tenantId, "/modules");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function setOverride(module: TenantModule, next: boolean | null) {
    setBusyKey(module.key);
    setMessage(null);
    try {
      const updated = await tenantRequest<TenantModulesView>(
        tenantId,
        "/modules",
        {
          method: "PATCH",
          body: JSON.stringify({
            overrides: [{ key: module.key, isEnabled: next }],
            reason: `Changed from the tenant Apps & Modules tab.`,
          }),
        },
      );
      setData(updated);
      setMessage({
        tone: "success",
        text:
          next === null
            ? `${module.label} now follows the plan entitlement.`
            : `${module.label} ${next ? "enabled" : "disabled"} for this tenant.`,
      });
    } catch (reason) {
      setMessage({
        tone: "error",
        text: describeError(reason, "The module override could not be saved."),
      });
    } finally {
      setBusyKey(null);
    }
  }

  const columns: ProDataTableColumn<TenantModule>[] = [
      {
        key: "module",
        header: "Module",
        minWidth: 220,
        render: (row) => (
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{row.label}</p>
            <p className="truncate text-xs text-slate-500">{row.description}</p>
          </div>
        ),
      },
      {
        key: "plan",
        header: "Plan state",
        minWidth: 150,
        render: (row) => (
          <StatePill
            value={row.isIncludedInPlan ? "Included" : "Not included"}
            tone={row.isIncludedInPlan ? "success" : "neutral"}
          />
        ),
      },
      {
        key: "override",
        header: "Tenant override",
        minWidth: 150,
        render: (row) =>
          row.tenantOverride === null ? (
            <span className="text-xs text-slate-500">None — follows plan</span>
          ) : (
            <StatePill
              value={row.tenantOverride ? "Enabled" : "Disabled"}
              tone={row.tenantOverride ? "info" : "warning"}
            />
          ),
      },
      {
        key: "effective",
        header: "Effective state",
        minWidth: 190,
        render: (row) => (
          <StatePill
            value={MODULE_STATE_LABEL[row.state]}
            tone={MODULE_STATE_TONE[row.state]}
          />
        ),
      },
      {
        key: "actions",
        header: "Action",
        minWidth: 230,
        render: (row) => (
          <div className="flex flex-wrap gap-1.5">
            <PanelButton
              busy={busyKey === row.key}
              disabled={!row.canEnable || row.tenantOverride === true}
              title={
                row.canEnable
                  ? undefined
                  : "The current plan does not include this module."
              }
              onClick={() => void setOverride(row, true)}
            >
              Enable
            </PanelButton>
            <PanelButton
              busy={busyKey === row.key}
              disabled={row.tenantOverride === false}
              onClick={() => void setOverride(row, false)}
            >
              Disable
            </PanelButton>
            <PanelButton
              busy={busyKey === row.key}
              disabled={row.tenantOverride === null}
              onClick={() => void setOverride(row, null)}
            >
              Follow plan
            </PanelButton>
          </div>
        ),
      },
  ];

  if (loading && !data)
    return (
      <PanelCard title="Modules">
        <PanelLoading label="module entitlement" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Modules">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  return (
    <PanelCard
      title="Modules"
      description="Plan entitlement combined with tenant override gives the effective state. An override cannot grant a module the plan does not include."
      actions={
        <StatePill
          value={`${data.enabledCount} of ${data.totalCount} enabled`}
          tone={data.enabledCount ? "success" : "danger"}
        />
      }
    >
      {message ? (
        <p
          role="status"
          className={`mb-4 rounded-lg px-3 py-2 text-xs ${
            message.tone === "error"
              ? "bg-rose-50 text-rose-800"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      {!data.planEntitlementActive ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The subscription is{" "}
          {data.subscriptionStatus
            ? formatEnumLabel(data.subscriptionStatus)
            : "missing"}
          , so no plan entitlement applies and every module resolves to disabled.
        </p>
      ) : null}
      {data.modules.length ? (
        <ProDataTable
          rows={data.modules}
          rowKey={(row) => row.key}
          columns={columns}
          compact
        />
      ) : (
        <PanelEmptyState
          title="Module availability is inherited from this tenant's plan unless overridden."
          description="No module definitions are configured for this platform."
        />
      )}
    </PanelCard>
  );
}

function TenantAppsSection({ tenantId }: { tenantId: string }) {
  const { data, loading, error, reload, setData } =
    useTenantResource<TenantAppsView>(tenantId, "/apps");
  const [managing, setManaging] = useState<TenantApp | null>(null);
  const [installationsFor, setInstallationsFor] = useState<TenantApp | null>(
    null,
  );

  if (loading && !data)
    return (
      <PanelCard title="Apps">
        <PanelLoading label="tenant applications" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Apps">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  return (
    <>
      <PanelCard
        title="Apps"
        description="DijiPeople applications and services this workspace runs. Only telemetry the platform actually receives is shown."
        actions={
          data.updatesAvailable ? (
            <StatePill
              value={`${data.updatesAvailable} update${data.updatesAvailable === 1 ? "" : "s"} available`}
              tone="warning"
            />
          ) : (
            <StatePill value="All current" tone="success" />
          )
        }
      >
        {data.apps.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.apps.map((app) => (
              <AppCard
                key={app.appKey}
                app={app}
                onManage={() => setManaging(app)}
                onViewInstallations={() => setInstallationsFor(app)}
              />
            ))}
          </div>
        ) : (
          <PanelEmptyState
            title="No tenant applications have been assigned."
            description="Assign the applications this customer is entitled to run."
          />
        )}
      </PanelCard>

      <PanelCard
        title="Attendance Gateway"
        description="On-premise gateways paired with this tenant, with the state each one last reported."
      >
        {data.gateways.length ? (
          <ProDataTable
            rows={data.gateways}
            rowKey={(row) => row.id}
            compact
            columns={gatewayColumns}
          />
        ) : (
          <PanelEmptyState
            title="No attendance gateway is paired with this tenant."
            description="A gateway is required only when attendance devices sit on the customer's own network. Pair one from Attendance in the tenant application."
          />
        )}
      </PanelCard>

      {managing ? (
        <ManageAppDialog
          tenantId={tenantId}
          app={managing}
          onClose={() => setManaging(null)}
          onSaved={(next) => {
            setData(next);
            setManaging(null);
          }}
        />
      ) : null}

      {installationsFor ? (
        <InstallationsDialog
          tenantId={tenantId}
          app={installationsFor}
          onClose={() => setInstallationsFor(null)}
        />
      ) : null}
    </>
  );
}

function AppCard({
  app,
  onManage,
  onViewInstallations,
}: {
  app: TenantApp;
  onManage: () => void;
  onViewInstallations: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{app.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatEnumLabel(app.channelType)} · {app.description}
          </p>
        </div>
        <StatePill
          value={app.healthStatus}
          tone={HEALTH_TONE[app.healthStatus] ?? "neutral"}
        />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {app.hasReleases ? (
          <>
            <Detail
              label="Installed"
              value={
                app.installedVersions.length
                  ? app.installedVersions
                      .map((item) => `${item.version} (${item.count})`)
                      .join(", ")
                  : "Not installed"
              }
            />
            <Detail
              label={
                app.updatePolicy === "PINNED" ? "Pinned version" : "Latest stable"
              }
              value={
                app.updatePolicy === "PINNED"
                  ? (app.assignedRelease?.version ?? "Not selected")
                  : (app.latestRelease?.version ?? "No published release")
              }
            />
            <Detail
              label="Update status"
              value={
                <StatePill
                  value={app.updateStatus}
                  tone={UPDATE_STATUS_TONE[app.updateStatus] ?? "neutral"}
                />
              }
            />
            <Detail
              label="Release channel"
              value={`${formatEnumLabel(app.channel)} · ${formatEnumLabel(app.updatePolicy)}`}
            />
            <Detail label="Last seen" value={relativeTime(app.lastSeenAt)} />
            <Detail
              label="Installations"
              value={
                app.installationCount ? `${app.installationCount}` : "None"
              }
            />
          </>
        ) : (
          <>
            <Detail
              label="Delivery"
              value="Hosted by DijiPeople — always current"
            />
            <Detail
              label="Status"
              value={<StatePill value={app.healthStatus} tone="success" />}
            />
          </>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {app.hasReleases ? (
          <>
            <PanelButton onClick={onManage}>Manage updates</PanelButton>
            <PanelButton onClick={onViewInstallations}>
              View installations
            </PanelButton>
          </>
        ) : null}
        {app.requiresFeatureKey ? (
          <span className="self-center text-[11px] text-slate-500">
            Requires the {formatEnumLabel(app.requiresFeatureKey)} module.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

const gatewayColumns: ProDataTableColumn<TenantGateway>[] = [
  {
    key: "name",
    header: "Gateway",
    minWidth: 180,
    render: (row) => (
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{row.name}</p>
        {row.code ? (
          <p className="text-xs text-slate-500">{row.code}</p>
        ) : null}
      </div>
    ),
  },
  {
    key: "version",
    header: "Version",
    minWidth: 110,
    render: (row) => row.version ?? "Unknown",
  },
  {
    key: "connectionHealth",
    header: "Status",
    minWidth: 150,
    render: (row) => (
      <StatePill
        value={row.connectionHealth}
        tone={HEALTH_TONE[row.connectionHealth] ?? "neutral"}
      />
    ),
  },
  {
    key: "host",
    header: "Host",
    minWidth: 140,
    render: (row) => row.host ?? "Not reported",
  },
  {
    key: "lastHeartbeatAt",
    header: "Last heartbeat",
    minWidth: 150,
    render: (row) => relativeTime(row.lastHeartbeatAt),
  },
  {
    key: "devices",
    header: "Devices",
    minWidth: 110,
    render: (row) => row.connectedDeviceCount,
  },
  {
    key: "lastSyncAt",
    header: "Last sync",
    minWidth: 150,
    render: (row) => relativeTime(row.lastSyncAt),
  },
  {
    key: "queue",
    header: "Queued events",
    minWidth: 140,
    render: (row) =>
      row.pendingQueueCount === null ? (
        "Not reported"
      ) : row.pendingQueueCount > 0 ? (
        <StatePill value={`${row.pendingQueueCount} pending`} tone="warning" />
      ) : (
        <StatePill value="Drained" tone="success" />
      ),
  },
];

function ManageAppDialog({
  tenantId,
  app,
  onClose,
  onSaved,
}: {
  tenantId: string;
  app: TenantApp;
  onClose: () => void;
  onSaved: (next: TenantAppsView) => void;
}) {
  const [channel, setChannel] = useState(app.channel);
  const [updatePolicy, setUpdatePolicy] = useState(app.updatePolicy);
  const [assignedReleaseId, setAssignedReleaseId] = useState(
    app.assignedRelease?.id ?? "",
  );
  const [minimumVersion, setMinimumVersion] = useState(app.minimumVersion ?? "");
  const [isEnabled, setIsEnabled] = useState(app.isEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const releases = useTenantResource<{ items: TenantRelease[] }>(
    tenantId,
    `/apps/${app.appKey}/releases`,
  );

  const available = (releases.data?.items ?? []).filter(
    (release) => release.channel === channel,
  );

  return (
    <PanelDialog
      title={`Manage ${app.name}`}
      description="Update policy applies to every installation of this app in this tenant. Production tenants should stay on Stable."
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant="primary"
            busy={busy}
            disabled={updatePolicy === "PINNED" && !assignedReleaseId}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const next = await tenantRequest<TenantAppsView>(
                  tenantId,
                  `/apps/${app.appKey}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({
                      isEnabled,
                      channel,
                      updatePolicy,
                      assignedReleaseId:
                        updatePolicy === "PINNED" ? assignedReleaseId : null,
                      minimumVersion: minimumVersion.trim() || null,
                    }),
                  },
                );
                onSaved(next);
              } catch (reason) {
                setError(
                  describeError(reason, "The app policy could not be saved."),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save policy
          </PanelButton>
        </>
      }
    >
      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <DialogField label="App enabled for this tenant">
        <span className="flex h-10 items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--admin-primary)]"
            checked={isEnabled}
            onChange={(event) => setIsEnabled(event.target.checked)}
          />
          <span className="text-sm text-slate-700">
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
        </span>
      </DialogField>
      <DialogField
        label="Release channel"
        hint="Production tenants default to Stable. Preview channels are for pilots."
      >
        <select
          className={dialogInputClass}
          value={channel}
          onChange={(event) => {
            setChannel(event.target.value);
            setAssignedReleaseId("");
          }}
        >
          <option value="STABLE">Stable</option>
          <option value="BETA">Preview</option>
          <option value="INTERNAL">Internal</option>
        </select>
      </DialogField>
      <DialogField label="Update policy">
        <select
          className={dialogInputClass}
          value={updatePolicy}
          onChange={(event) =>
            setUpdatePolicy(event.target.value as TenantApp["updatePolicy"])
          }
        >
          <option value="AUTOMATIC">
            Automatic — always the latest on the channel
          </option>
          <option value="MANUAL">Manual — operator decides when to move</option>
          <option value="PINNED">Pinned — hold a specific release</option>
        </select>
      </DialogField>
      {updatePolicy === "PINNED" ? (
        <DialogField label="Pinned release" required>
          {releases.loading ? (
            <span className="text-xs text-slate-500">Loading releases…</span>
          ) : available.length ? (
            <select
              className={dialogInputClass}
              value={assignedReleaseId}
              onChange={(event) => setAssignedReleaseId(event.target.value)}
            >
              <option value="">Select a release</option>
              {available.map((release) => (
                <option key={release.id} value={release.id}>
                  {release.version} · {release.platform} · {release.architecture}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-slate-500">
              No published release on this channel yet.
            </span>
          )}
        </DialogField>
      ) : null}
      <DialogField
        label="Minimum supported version"
        hint="Installations below this version are reported as out of support."
      >
        <input
          className={dialogInputClass}
          value={minimumVersion}
          onChange={(event) => setMinimumVersion(event.target.value)}
          placeholder="1.4.0"
        />
      </DialogField>
      {app.latestRelease?.releaseNotes ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Release notes — {app.latestRelease.version}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
            {app.latestRelease.releaseNotes}
          </p>
        </div>
      ) : null}
    </PanelDialog>
  );
}

function InstallationsDialog({
  tenantId,
  app,
  onClose,
}: {
  tenantId: string;
  app: TenantApp;
  onClose: () => void;
}) {
  const { data, loading, error, reload } = useTenantResource<{
    targetVersion: string | null;
    items: TenantInstallation[] | TenantGateway[];
  }>(tenantId, `/apps/${app.appKey}/installations`);

  return (
    <PanelDialog
      title={`${app.name} installations`}
      description={
        app.channelType === "ON_PREMISE"
          ? "Gateways registered against this tenant."
          : "Devices reporting this agent, with the version each one is running."
      }
      onClose={onClose}
      wide
      footer={<PanelButton onClick={onClose}>Close</PanelButton>}
    >
      {loading && !data ? (
        <PanelLoading label="installations" />
      ) : error ? (
        <PanelError message={error} onRetry={reload} />
      ) : app.channelType === "ON_PREMISE" ? (
        <ProDataTable
          rows={(data?.items ?? []) as TenantGateway[]}
          rowKey={(row) => row.id}
          compact
          columns={gatewayColumns}
          emptyTitle="No gateways are registered."
          emptyDescription="Pair a gateway from Attendance in the tenant application."
        />
      ) : (
        <ProDataTable
          rows={(data?.items ?? []) as TenantInstallation[]}
          rowKey={(row) => row.id}
          compact
          emptyTitle="No devices have reported this agent."
          emptyDescription="Devices appear here the first time the agent signs in."
          columns={[
            {
              key: "deviceName",
              header: "Device",
              minWidth: 180,
              render: (row) => (
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{row.deviceName}</p>
                  {row.assignedTo ? (
                    <p className="text-xs text-slate-500">{row.assignedTo}</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: "version",
              header: "Version",
              minWidth: 110,
              render: (row) => row.version,
            },
            {
              key: "updateStatus",
              header: "Update",
              minWidth: 160,
              render: (row) => (
                <StatePill
                  value={row.updateStatus}
                  tone={UPDATE_STATUS_TONE[row.updateStatus] ?? "neutral"}
                />
              ),
            },
            {
              key: "os",
              header: "Operating system",
              minWidth: 170,
              render: (row) => `${row.platform} · ${row.os}`,
            },
            {
              key: "status",
              header: "Status",
              minWidth: 120,
              render: (row) => (
                <StatePill
                  value={row.isActive ? "Active" : "Inactive"}
                  tone={row.isActive ? "success" : "neutral"}
                />
              ),
            },
            {
              key: "lastSeenAt",
              header: "Last seen",
              minWidth: 150,
              render: (row) => relativeTime(row.lastSeenAt),
            },
          ]}
        />
      )}
      {data?.targetVersion ? (
        <p className="mt-3 text-xs text-slate-500">
          Target version for this tenant: {data.targetVersion}
        </p>
      ) : null}
    </PanelDialog>
  );
}

export function TenantAppSummaryList({ apps }: { apps: TenantApp[] }) {
  return (
    <DefinitionList
      items={apps.map((app) => ({
        label: app.name,
        value: app.hasReleases
          ? `${app.installedVersions[0]?.version ?? "Not installed"} · ${formatEnumLabel(app.updateStatus)}`
          : formatEnumLabel(app.healthStatus),
        hint: app.lastSeenAt ? `Last seen ${formatDate(app.lastSeenAt)}` : undefined,
      }))}
    />
  );
}
