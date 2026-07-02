"use client";

import {
  Activity,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Clock,
  Laptop,
  Plus,
  Search,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  resolveSystemWidgetAvailability,
  type SystemWidgetDefinition,
} from "@repo/config";
import type {
  FormComponentMetadata,
  TimelineEntryMetadata,
  WidgetMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { flattenRuntimeRoles } from "@/lib/runtime/role-runtime";
import { Button } from "@/app/components/ui/button";
import { formatDateTime } from "@/lib/formatting-context";
import { DataTable } from "@/app/components/data-table/data-table";
import { EmployeeProfileImageCard } from "@/app/(authenticated)/employees/_components/employee-profile-image-card";
import type { EmployeeDocumentSummary } from "@/app/(authenticated)/employees/types";

export function ModuleWidgetRenderer({
  component,
  dataAdapter,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly runtime?: ModuleRuntimeContext;
}) {
  if (component.widgetType === "agent_desktop") {
    return (
      <ModuleAgentDesktopWidget
        component={component}
        dataAdapter={dataAdapter}
        runtime={runtime}
      />
    );
  }

  const availability = resolveSystemWidgetAvailability({
    widgetKey: component.widgetId,
    widgetType: component.widgetType,
    lifecycleState: component.lifecycleState,
    formComponentType: component.type,
    moduleKey: runtime?.module.key ?? "",
    moduleCapabilities: runtime?.module.capabilities,
    recordId: runtime?.recordId,
    adapterMethods: resolveAdapterMethods(dataAdapter),
    permissionKeys: runtime?.security.principal.permissionKeys,
    roleKeys: flattenRuntimeRoles([
      ...(runtime?.security.principal.roleKeys ?? []),
      ...(runtime?.security.principal.roles ?? []),
    ]),
  });
  const title =
    component.label ??
    availability.definition?.displayName ??
    "Widget unavailable";

  if (availability.status !== "available" || !availability.definition) {
    return (
      <WidgetState
        description={availability.message}
        title={title}
        tone={availability.status === "unsaved-record" ? "neutral" : "warning"}
      />
    );
  }

  const renderer = BUILTIN_WIDGET_RENDERERS[availability.definition.widgetKey];
  if (renderer) {
    return renderer({
      component,
      dataAdapter,
      definition: availability.definition,
      runtime,
    });
  }

  return (
    <WidgetState
      description="This System Widget has no registered renderer."
      title={title}
      tone="warning"
    />
  );
}

function ModuleAgentDesktopWidget({
  component,
  dataAdapter,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getWidgetData),
  );
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) {
      return;
    }
    let active = true;
    const getWidgetData = dataAdapter.getWidgetData;
    const load = () =>
      getWidgetData({
        runtime,
        recordId,
        widget: {
          id: component.widgetId ?? component.id,
          logicalName: "system.agentDesktop",
          displayName: component.label ?? "Agent Desktop",
          version: "1.0.0",
          lifecycleState: "published",
          layer: "system",
          widgetType: "agent_desktop",
          isSystem: true,
          isCustom: false,
          allowedModuleKeys: ["employees"],
        },
      })
        .then((result) => {
          if (!active) return;
          setData(isRecord(result) ? result : null);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (!active) return;
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load Agent Desktop data.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    void load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [component, dataAdapter, recordId, runtime]);

  if (loading) {
    return (
      <WidgetState
        title="Agent Desktop"
        description="Loading Agent Desktop data..."
      />
    );
  }
  if (error) {
    return (
      <WidgetState title="Agent Desktop" description={error} tone="warning" />
    );
  }
  if (!data) {
    return (
      <WidgetState
        title="Agent Desktop"
        description="No Agent Desktop activity is available for this employee."
      />
    );
  }

  const latestSession = isRecord(data.latestSession)
    ? data.latestSession
    : null;
  const todaySummary = isRecord(data.todaySummary) ? data.todaySummary : null;
  const employee = isRecord(data.employee) ? data.employee : null;
  const retention = isRecord(data.retention) ? data.retention : null;
  const devices = Array.isArray(data.devices)
    ? data.devices.filter(isRecord)
    : [];
  const recentEvents = Array.isArray(data.recentEvents)
    ? data.recentEvents.filter(isRecord)
    : [];
  const liveStatus = stringValue(data.liveStatus) || "OFFLINE";
  const lastActivityAt =
    stringValue(latestSession?.lastHeartbeatAt) ||
    stringValue(latestSession?.endedAt) ||
    stringValue(latestSession?.startedAt);

  return (
    <section className="grid w-full min-w-0 gap-5 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-foreground">
            {component.label ?? "Agent Desktop"}
          </h4>
          <p className="mt-1 text-sm text-muted">
            {stringValue(employee?.fullName) || "Employee"} activity, device,
            and productivity telemetry.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AgentStatusBadge value={liveStatus} />
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">
            {devices.length} device{devices.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">
            {recentEvents.length} event{recentEvents.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AgentMetric
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Live status"
          value={formatStatus(liveStatus)}
        />
        <AgentMetric
          icon={<Activity className="h-4 w-4" />}
          label="Logged in"
          value={durationLabel(todaySummary?.loggedInSeconds)}
        />
        <AgentMetric
          icon={<Timer className="h-4 w-4" />}
          label="Active time"
          value={durationLabel(todaySummary?.activeSeconds)}
        />
        <AgentMetric
          icon={<Clock className="h-4 w-4" />}
          label="Idle time"
          value={durationLabel(todaySummary?.idleSeconds)}
        />
        <AgentMetric
          icon={<Clock className="h-4 w-4" />}
          label="Away time"
          value={durationLabel(todaySummary?.awaySeconds)}
        />
        <AgentMetric
          icon={<Activity className="h-4 w-4" />}
          label="Utilization"
          value={`${Math.round(numberValue(todaySummary?.utilizationPercent))}%`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AgentDetailPanel title="Latest session">
          <AgentDetailItem
            label="Status"
            value={formatStatus(stringValue(latestSession?.status))}
          />
          <AgentDetailItem
            label="Started"
            value={
              formatDateTime(
                stringValue(latestSession?.startedAt),
                runtime?.tenant,
              ) || "Not set"
            }
          />
          <AgentDetailItem
            label="Last heartbeat"
            value={
              formatDateTime(
                stringValue(latestSession?.lastHeartbeatAt),
                runtime?.tenant,
              ) || "Not set"
            }
          />
          <AgentDetailItem
            label="Ended"
            value={
              formatDateTime(
                stringValue(latestSession?.endedAt),
                runtime?.tenant,
              ) || "Not ended"
            }
          />
          <AgentDetailItem
            label="Session active"
            value={durationLabel(latestSession?.totalActiveSeconds)}
          />
          <AgentDetailItem
            label="Session idle"
            value={durationLabel(latestSession?.totalIdleSeconds)}
          />
          <AgentDetailItem
            label="Session away"
            value={durationLabel(latestSession?.totalAwaySeconds)}
          />
        </AgentDetailPanel>

        <AgentDetailPanel title="Reporting window">
          <AgentDetailItem
            label="Last activity"
            value={
              formatDateTime(lastActivityAt, runtime?.tenant) || "Not seen yet"
            }
          />
          <AgentDetailItem
            label="Retention"
            value={`${numberValue(retention?.historyRetentionDays)} days`}
          />
          <AgentDetailItem
            label="From"
            value={
              formatDateTime(stringValue(retention?.from), runtime?.tenant) ||
              "Not set"
            }
          />
          <AgentDetailItem
            label="To"
            value={
              formatDateTime(stringValue(retention?.to), runtime?.tenant) ||
              "Not set"
            }
          />
          <AgentDetailItem
            label="Employee ID"
            value={stringValue(employee?.id) || "Not set"}
          />
          <AgentDetailItem
            label="User ID"
            value={stringValue(employee?.userId) || "Not linked"}
          />
        </AgentDetailPanel>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Laptop className="h-4 w-4 text-muted" />
          <h5 className="text-sm font-semibold text-foreground">
            Registered devices
          </h5>
        </div>
        <DataTable
          columns={[
            {
              key: "deviceName",
              header: "Device",
              searchable: true,
              render: (row) =>
                stringValue(row.deviceName) || stringValue(row.id) || "Unknown",
            },
            {
              key: "platform",
              header: "Platform",
              render: (row) => stringValue(row.platform) || "Not set",
            },
            {
              key: "os",
              header: "OS",
              render: (row) => stringValue(row.os) || "Not set",
            },
            {
              key: "agentVersion",
              header: "Agent Version",
              render: (row) => stringValue(row.agentVersion) || "Not set",
            },
            {
              key: "isActive",
              header: "Active",
              render: (row) => (row.isActive === false ? "No" : "Yes"),
            },
            {
              key: "lastSeenAt",
              header: "Last Seen",
              sortable: true,
              sortAccessor: (row) => stringValue(row.lastSeenAt),
              render: (row) =>
                formatDateTime(
                  stringValue(row.lastSeenAt) ||
                    stringValue(row.lastHeartbeatAt),
                  runtime?.tenant,
                ) || "Not set",
            },
          ]}
          emptyState={
            <p className="p-4 text-sm text-muted">
              No registered Agent Desktop devices.
            </p>
          }
          enableSearch
          getRowKey={(row) => stringValue(row.id)}
          pagination={{
            page: 1,
            pageSize: 5,
            totalItems: devices.length,
            pageSizeOptions: [5, 10, 25],
          }}
          rows={devices}
          searchPlaceholder="Search devices"
        />
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted" />
          <h5 className="text-sm font-semibold text-foreground">
            Recent activity events
          </h5>
        </div>
        <DataTable
          columns={[
            {
              key: "occurredAt",
              header: "Occurred At",
              sortable: true,
              sortAccessor: (row) => stringValue(row.occurredAt),
              render: (row) =>
                formatDateTime(stringValue(row.occurredAt), runtime?.tenant) ||
                "Not set",
            },
            {
              key: "state",
              header: "State",
              filterable: true,
              filterType: "select",
              filterOptions: [
                { label: "Active", value: "ACTIVE" },
                { label: "Idle", value: "IDLE" },
                { label: "Away", value: "AWAY" },
              ],
              render: (row) => formatStatus(stringValue(row.state)),
            },
            {
              key: "idleSeconds",
              header: "Idle Seconds",
              render: (row) => String(numberValue(row.idleSeconds)),
            },
            {
              key: "activeApp",
              header: "Active App",
              searchable: true,
              render: (row) => stringValue(row.activeApp) || "Not captured",
            },
            {
              key: "windowTitle",
              header: "Window Title",
              searchable: true,
              render: (row) => stringValue(row.windowTitle) || "Not captured",
            },
            {
              key: "browserTabTitle",
              header: "Browser Tab",
              searchable: true,
              render: (row) =>
                stringValue(row.browserTabTitle) || "Not captured",
            },
            {
              key: "agentVersion",
              header: "Agent Version",
              render: (row) => stringValue(row.agentVersion) || "Not set",
            },
          ]}
          emptyState={
            <p className="p-4 text-sm text-muted">
              No Agent Desktop activity events were found for this window.
            </p>
          }
          enableSearch
          getRowKey={(row) => stringValue(row.id)}
          initialSort={{ columnKey: "occurredAt", direction: "desc" }}
          pagination={{
            page: 1,
            pageSize: 10,
            totalItems: recentEvents.length,
            pageSizeOptions: [10, 25, 50, 100],
          }}
          rows={recentEvents}
          searchPlaceholder="Search activity events"
        />
      </div>
    </section>
  );
}

function AgentMetric({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/5 p-3">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 break-words text-lg font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function AgentDetailPanel({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted/5 p-4">
      <h5 className="text-sm font-semibold text-foreground">{title}</h5>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function AgentDetailItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

function AgentStatusBadge({ value }: { readonly value: string }) {
  const normalized = value.toUpperCase();
  const tone =
    normalized === "LIVE" || normalized === "ACTIVE"
      ? "border-success/30 bg-success/10 text-success"
      : normalized === "STALE" || normalized === "IDLE" || normalized === "AWAY"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-border bg-muted/10 text-muted";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}
    >
      {formatStatus(value)}
    </span>
  );
}

function formatStatus(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Not set";
  return normalized
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function durationLabel(value: unknown) {
  const seconds = Math.max(0, numberValue(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

type WidgetRenderer = (props: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) => ReactNode;

const BUILTIN_WIDGET_RENDERERS: Readonly<Record<string, WidgetRenderer>> = {
  "employee.profilePhoto": (props) => <EmployeeProfilePhotoWidget {...props} />,
  "system.timeline": (props) => <ModuleTimelineWidget {...props} />,
  "system.reportingHierarchy": (props) => (
    <ModuleReportingHierarchyWidget {...props} />
  ),
  "system.approvalTracker": (props) => (
    <ModuleApprovalTrackerWidget {...props} />
  ),
};

function EmployeeProfilePhotoWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getWidgetData),
  );
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) return;
    let active = true;
    dataAdapter
      .getWidgetData({
        runtime,
        recordId,
        widget: systemWidgetMetadata(component, definition),
      })
      .then((result) => {
        if (!active) return;
        setData(isRecord(result) ? result : null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Profile Photo.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [component, dataAdapter, definition, recordId, runtime]);

  if (loading) {
    return (
      <WidgetState
        title="Profile Photo"
        description="Loading Profile Photo..."
      />
    );
  }
  if (error || !data || !recordId) {
    return (
      <WidgetState
        title="Profile Photo"
        description={error ?? definition.emptyState}
        tone={error ? "warning" : "neutral"}
      />
    );
  }

  const displayName =
    stringValue(data.fullName) ||
    [stringValue(data.firstName), stringValue(data.lastName)]
      .filter(Boolean)
      .join(" ") ||
    "Employee";
  const profileImage = isRecord(data.profileImage)
    ? ({
        id: stringValue(data.profileImage.id),
        fileName: stringValue(data.profileImage.fileName),
        mimeType: stringValue(data.profileImage.mimeType),
        size: numberValue(data.profileImage.size),
        createdAt: stringValue(data.profileImage.createdAt) || undefined,
      } as EmployeeDocumentSummary)
    : null;
  const permissionKeys = new Set(
    runtime?.security.principal.permissionKeys ?? [],
  );
  const isOwnProfile =
    stringValue(data.userId) === runtime?.security.principal.userId ||
    stringValue(data.ownerUserId) === runtime?.security.principal.userId;
  const canUpload =
    isOwnProfile ||
    permissionKeys.has("employees.update.self") ||
    permissionKeys.has("employees.documents.upload");
  const canRemove = permissionKeys.has("employees.documents.delete");

  return (
    <EmployeeProfileImageCard
      canRemove={canRemove}
      canUpload={canUpload}
      employeeId={recordId}
      employeeName={displayName}
      profileImage={profileImage}
    />
  );
}

function ModuleReportingHierarchyWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) return;
    let active = true;
    dataAdapter
      .getWidgetData({
        runtime,
        recordId,
        widget: systemWidgetMetadata(component, definition),
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Reporting Hierarchy.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [component, dataAdapter, definition, recordId, runtime]);

  const hierarchy = readReportingHierarchy(data);
  if (loading) {
    return (
      <WidgetState
        description="Loading Reporting Hierarchy..."
        title={component.label ?? definition.displayName}
      />
    );
  }
  if (error) {
    return (
      <WidgetState
        description={error}
        title={component.label ?? definition.displayName}
        tone="warning"
      />
    );
  }
  if (!hierarchy) {
    return (
      <WidgetState
        description={definition.emptyState}
        title={component.label ?? definition.displayName}
      />
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h4 className="font-semibold text-foreground">
        {component.label ?? definition.displayName}
      </h4>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <HierarchyGroup
          emptyText="No manager is recorded."
          label="Reporting line"
          nodes={hierarchy.reportingLine}
        />
        <HierarchyGroup
          emptyText="Current Employee is unavailable."
          label="Current Employee"
          nodes={hierarchy.currentEmployee ? [hierarchy.currentEmployee] : []}
        />
        <HierarchyGroup
          emptyText="No direct reports."
          label="Direct reports"
          nodes={hierarchy.directReports}
        />
      </div>
    </section>
  );
}

function HierarchyGroup({
  emptyText,
  label,
  nodes,
}: {
  readonly emptyText: string;
  readonly label: string;
  readonly nodes: readonly ReportingHierarchyNode[];
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-2 grid gap-2">
        {nodes.length ? (
          nodes.map((node) => (
            <div key={node.id}>
              <p className="text-sm font-medium text-foreground">{node.name}</p>
              {node.subtitle ? (
                <p className="text-xs text-muted">{node.subtitle}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function ModuleApprovalTrackerWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getWidgetData),
  );
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getWidgetData) return;
    let active = true;
    dataAdapter
      .getWidgetData({
        runtime,
        recordId,
        widget: systemWidgetMetadata(component, definition),
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Approval tracker data is not available for this record.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [component, dataAdapter, definition, recordId, runtime]);

  const approval = readApprovalTrackerItem(data);
  if (loading) {
    return (
      <WidgetState
        description="Loading approval tracker..."
        title={component.label ?? "Approval Tracker"}
      />
    );
  }
  if (error || !approval) {
    return (
      <WidgetState
        description={error ?? definition.emptyState}
        title={component.label ?? "Approval Tracker"}
        tone="warning"
      />
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-foreground">
          {component.label ?? "Approval Tracker"}
        </h4>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
          {approval.status}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {approval.steps.map((step) => (
          <article
            className="rounded-lg border border-border p-3"
            key={step.id}
          >
            <p className="text-sm font-medium text-foreground">
              {step.name} - {step.status}
            </p>
            <p className="mt-1 text-xs text-muted">
              {step.actors || "Approver is not assigned."}
            </p>
            {step.actionAt ? (
              <p className="mt-1 text-xs text-muted">{step.actionAt}</p>
            ) : null}
            {step.comment ? (
              <p className="mt-2 text-sm text-foreground">{step.comment}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function readApprovalTrackerItem(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items) || !items.length) return null;
  const item = items[0];
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const steps = Array.isArray(record.steps) ? record.steps : [];

  return {
    status: stringValue(record.status) || "Pending",
    steps: steps
      .filter((step): step is Record<string, unknown> =>
        Boolean(step && typeof step === "object" && !Array.isArray(step)),
      )
      .map((step, index) => {
        const assignments = Array.isArray(step.assignments)
          ? step.assignments
          : [];
        const actions = Array.isArray(step.actions) ? step.actions : [];
        const latestAction = actions.at(-1);
        const action =
          latestAction &&
          typeof latestAction === "object" &&
          !Array.isArray(latestAction)
            ? (latestAction as Record<string, unknown>)
            : null;
        return {
          id: stringValue(step.id) || `approval-step-${index}`,
          name: stringValue(step.name) || `Approval step ${index + 1}`,
          status: stringValue(step.status) || "Pending",
          actors: assignments.map(readApprovalActor).filter(Boolean).join(", "),
          actionAt:
            stringValue(action?.actionAtUtc) || stringValue(action?.createdAt),
          comment:
            stringValue(action?.comment) ||
            stringValue(action?.reason) ||
            stringValue(step.comment),
        };
      }),
  };
}

function readApprovalActor(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const assignment = value as Record<string, unknown>;
  const user = assignment.assignedToUser;
  const role = assignment.assignedToRole;
  if (user && typeof user === "object" && !Array.isArray(user)) {
    const record = user as Record<string, unknown>;
    return (
      [stringValue(record.firstName), stringValue(record.lastName)]
        .filter(Boolean)
        .join(" ") || stringValue(record.email)
    );
  }
  if (role && typeof role === "object" && !Array.isArray(role)) {
    return stringValue((role as Record<string, unknown>).name);
  }
  return "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

type ReportingHierarchyNode = {
  readonly id: string;
  readonly name: string;
  readonly subtitle?: string;
};

function readReportingHierarchy(value: unknown) {
  if (!isRecord(value)) return null;
  const currentEmployee = readHierarchyNode(value.currentEmployee);
  const reportingLine = readHierarchyNodes(value.reportingLine);
  const directReports = readHierarchyNodes(value.directReports);
  if (!currentEmployee && !reportingLine.length && !directReports.length) {
    return null;
  }
  return { currentEmployee, reportingLine, directReports };
}

function readHierarchyNodes(value: unknown) {
  return Array.isArray(value)
    ? value.map(readHierarchyNode).filter(isHierarchyNode)
    : [];
}

function readHierarchyNode(value: unknown): ReportingHierarchyNode | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id) || stringValue(value.userId);
  const name =
    stringValue(value.displayName) ||
    stringValue(value.name) ||
    stringValue(value.label);
  if (!id || !name) return null;
  const subtitle =
    stringValue(value.subtitle) || stringValue(value.secondaryLabel);
  return { id, name, subtitle: subtitle || undefined };
}

function isHierarchyNode(
  value: ReportingHierarchyNode | null,
): value is ReportingHierarchyNode {
  return Boolean(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function systemWidgetMetadata(
  component: FormComponentMetadata,
  definition: SystemWidgetDefinition,
): WidgetMetadata {
  return {
    id: component.widgetId ?? component.id,
    logicalName: definition.widgetKey,
    displayName: component.label ?? definition.displayName,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    widgetType: component.widgetType ?? definition.aliases[0] ?? "system",
    isSystem: true,
    isCustom: false,
    allowedModuleKeys: definition.supportedModules,
  };
}

function resolveAdapterMethods(dataAdapter?: ModuleDataAdapter) {
  if (!dataAdapter) return [];
  return ["getTimelineEntries", "getWidgetData"].filter(
    (method) =>
      typeof dataAdapter[method as "getTimelineEntries" | "getWidgetData"] ===
      "function",
  );
}

function ModuleTimelineWidget({
  component,
  dataAdapter,
  definition,
  runtime,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly definition: SystemWidgetDefinition;
  readonly runtime?: ModuleRuntimeContext;
}) {
  const [entries, setEntries] = useState<readonly TimelineEntryMetadata[]>([]);
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(
    Boolean(runtime?.recordId && dataAdapter?.getTimelineEntries),
  );
  const [error, setError] = useState<string | null>(null);
  const recordId = runtime?.recordId;

  useEffect(() => {
    if (!runtime || !recordId || !dataAdapter?.getTimelineEntries) return;
    let active = true;
    dataAdapter
      .getTimelineEntries({
        runtime,
        recordId,
        search,
        sortDirection,
      })
      .then((result) => {
        if (active) {
          setError(null);
          setEntries(result);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load Timeline.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataAdapter, recordId, runtime, search, sortDirection]);

  const visibleEntries = useMemo(
    () =>
      [...entries].sort((left, right) =>
        sortDirection === "desc"
          ? right.occurredAt.localeCompare(left.occurredAt)
          : left.occurredAt.localeCompare(right.occurredAt),
      ),
    [entries, sortDirection],
  );

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <h4 className="font-semibold text-foreground">
          {component.label ?? "Timeline"}
        </h4>
        <div className="flex w-full items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="h-9 w-full rounded-md border border-border pl-9 pr-3 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Timeline"
              value={search}
            />
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              leftIcon={
                sortDirection === "desc" ? (
                  <ArrowDownWideNarrow className="h-4 w-4" />
                ) : (
                  <ArrowUpNarrowWide className="h-4 w-4" />
                )
              }
              onClick={() =>
                setSortDirection((current) =>
                  current === "desc" ? "asc" : "desc",
                )
              }
              size="icon-sm"
              title={sortDirection === "desc" ? "Latest first" : "Oldest first"}
              aria-label={
                sortDirection === "desc" ? "Latest first" : "Oldest first"
              }
              variant="secondary"
            />

            <Button
              disabled
              leftIcon={<Plus className="h-4 w-4" />}
              size="icon-sm"
              title="Quick Create"
              aria-label="Quick Create"
              variant="secondary"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-4">
        {loading ? (
          <p className="text-sm text-muted">Loading Timeline...</p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : !dataAdapter?.getTimelineEntries ? (
          <p className="text-sm text-muted">
            {definition.missingAdapterDiagnostic}
          </p>
        ) : visibleEntries.length === 0 ? (
          <p className="text-sm text-muted">{definition.emptyState}</p>
        ) : (
          visibleEntries.map((entry) => (
            <article
              className="rounded-lg border border-border bg-muted/5 p-3"
              key={entry.id}
            >
              <p className="text-sm text-foreground">
                <TimelineTemplate entry={entry} runtime={runtime} />
              </p>
              <p className="mt-1 text-xs text-muted">
                {entry.actorDisplayName ? `${entry.actorDisplayName} - ` : ""}
                {formatDateTime(entry.occurredAt, runtime?.tenant)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function TimelineTemplate({
  entry,
  runtime,
}: {
  entry: TimelineEntryMetadata;
  runtime?: ModuleRuntimeContext;
}) {
  const placeholders = new Map(
    (entry.placeholders ?? []).map((placeholder) => [
      placeholder.key,
      placeholder,
    ]),
  );
  const parts = entry.template.split(/(\{\{[^}]+\}\})/g);

  return parts.map((part, index) => {
    const match = /^\{\{([^}]+)\}\}$/.exec(part);
    if (!match) return <span key={`${part}-${index}`}>{part}</span>;
    const placeholder = placeholders.get(match[1] ?? "");
    if (!placeholder) return <span key={`${part}-${index}`}>{part}</span>;
    const canOpen =
      placeholder.href &&
      (!placeholder.permission ||
        runtime?.security.principal.permissionKeys.includes(
          placeholder.permission.permissionKey,
        ));
    return canOpen ? (
      <a
        className="font-medium text-accent hover:underline"
        href={placeholder.href}
        key={`${placeholder.key}-${index}`}
        rel="noreferrer"
        target="_blank"
      >
        {placeholder.value}
      </a>
    ) : (
      <span className="font-medium" key={`${placeholder.key}-${index}`}>
        {placeholder.value}
      </span>
    );
  });
}

function WidgetState({
  description,
  title,
  tone = "neutral",
}: {
  description: string;
  title: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={`rounded-lg border border-dashed p-4 ${
        tone === "warning" ? "border-warning/40 bg-warning/5" : "border-border"
      }`}
    >
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}
