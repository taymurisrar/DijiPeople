"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { formatDateTimeWithTenantSettings } from "@/lib/date-format";

type EmployeeAgentSummaryResponse = {
  devices: Array<{
    id: string;
    deviceName: string;
    os: string;
    platform: string;
    agentVersion: string;
    lastSeenAt: string | null;
    isActive: boolean;
  }>;
  latestSession: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    lastHeartbeatAt: string | null;
    totalActiveSeconds: number;
    totalIdleSeconds: number;
    totalAwaySeconds: number;
  } | null;
  todaySummary: {
    loggedInSeconds: number;
    activeSeconds: number;
    idleSeconds: number;
    awaySeconds: number;
    utilizationPercent: number;
  } | null;
  recentEvents: Array<{
    id: string;
    state: string;
    idleSeconds: number;
    activeApp: string | null;
    windowTitle: string | null;
    activeAppPath: string | null;
    browserTabTitle: string | null;
    activeProcessId: number | null;
    agentVersion: string | null;
    occurredAt: string;
  }>;
};

type GroupedAgentActivity = {
  id: string;
  rowType: "group";
  isExpanded: boolean;
  state: string;
  activeApp: string | null;
  activeAppPath: string | null;
  browserTabTitle: string | null;
  windowTitle: string | null;
  activeProcessId: number | null;
  latestAt: string;
  maxIdleSeconds: number;
  events: EmployeeAgentSummaryResponse["recentEvents"];
};

type AgentActivityDetailRow = {
  id: string;
  rowType: "detail";
  group: Omit<GroupedAgentActivity, "rowType" | "isExpanded">;
};

type AgentActivityRow = GroupedAgentActivity | AgentActivityDetailRow;

type FormattingOptions = {
  dateFormat: string;
  locale: string;
  timeFormat: string;
  timezone: string;
};

export function EmployeeAgentSection({
  agentSummary,
  formattingOptions,
}: {
  agentSummary: EmployeeAgentSummaryResponse | null;
  formattingOptions: FormattingOptions;
}) {
  const formatDateTime = (value?: string | null) =>
    formatDateTimeWithTenantSettings(value, formattingOptions);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );

  const groupedActivities = useMemo(
    () => groupAgentActivityEvents(agentSummary?.recentEvents ?? []).slice(0, 10),
    [agentSummary?.recentEvents],
  );

  if (!agentSummary) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
        No desktop activity has been recorded for this employee yet.
      </div>
    );
  }

  const latestSession = agentSummary.latestSession;
  const todaySummary = agentSummary.todaySummary;

  function toggleGroup(groupId: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }

  const activityRows: AgentActivityRow[] = groupedActivities.flatMap((group) => {
    const isExpanded = expandedGroupIds.has(group.id);

    return [
      {
        ...group,
        rowType: "group" as const,
        isExpanded,
      },
      ...(isExpanded
        ? [
            {
              id: `${group.id}-details`,
              rowType: "detail" as const,
              group,
            },
          ]
        : []),
    ];
  });

  return (
    <section className="grid max-w-full gap-6 overflow-hidden">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Work Activity
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              Today’s desktop activity summary
            </h2>
            <p className="mt-1 text-sm text-muted">
              HR-friendly view of active work, idle time, away time, and latest
              desktop activity.
            </p>
          </div>

          {latestSession ? (
            <span className="w-fit shrink-0 rounded-full border border-border bg-white/80 px-3 py-1 text-xs font-semibold text-muted">
              Last activity: {formatDateTime(latestSession.lastHeartbeatAt)}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AgentMetricCard
            label="Focused work"
            value={formatDuration(todaySummary?.activeSeconds ?? 0)}
            helper="Time actively using the device"
          />
          <AgentMetricCard
            label="Idle time"
            value={formatDuration(todaySummary?.idleSeconds ?? 0)}
            helper="Device inactive for a short period"
          />
          <AgentMetricCard
            label="Away time"
            value={formatDuration(todaySummary?.awaySeconds ?? 0)}
            helper="Employee away from the device"
          />
          <AgentMetricCard
            label="Utilization"
            value={`${Math.round(todaySummary?.utilizationPercent ?? 0)}%`}
            helper="Active time vs total tracked time"
          />
        </div>
      </article>

      <div className="grid max-w-full gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <article className="min-w-0 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Current / Latest Session
          </p>

          {latestSession ? (
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              <DetailItem label="Session status" value={formatAgentStatus(latestSession.status)} />
              <DetailItem label="Started" value={formatDateTime(latestSession.startedAt)} />
              <DetailItem label="Last activity" value={formatDateTime(latestSession.lastHeartbeatAt)} />
              <DetailItem
                label="Ended"
                value={latestSession.endedAt ? formatDateTime(latestSession.endedAt) : "Still running"}
              />
              <DetailItem label="Focused work" value={formatDuration(latestSession.totalActiveSeconds)} />
              <DetailItem label="Idle time" value={formatDuration(latestSession.totalIdleSeconds)} />
              <DetailItem label="Away time" value={formatDuration(latestSession.totalAwaySeconds)} />
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted">
              No desktop work session has been recorded yet.
            </p>
          )}
        </article>

        <article className="min-w-0 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Employee Device
          </p>

          <div className="mt-5 grid gap-4">
            {agentSummary.devices.length === 0 ? (
              <p className="text-sm text-muted">
                No registered desktop device found for this employee.
              </p>
            ) : (
              agentSummary.devices.map((device) => (
                <div
                  key={device.id}
                  className="min-w-0 rounded-2xl border border-border bg-white/80 px-5 py-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {device.deviceName || "Unnamed device"}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">
                        {device.os} • {device.platform}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Agent version: v{device.agentVersion}
                      </p>
                    </div>

                    <span
                      className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        device.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {device.isActive ? "Active device" : "Inactive device"}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-muted">
                    Last seen: {formatDateTime(device.lastSeenAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </div>

      <article className="max-w-full overflow-hidden rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Recent Activity
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              App and browser activity
            </h2>
            <p className="mt-1 text-sm text-muted">
              Repeated logs are grouped. Expand a row to review the captured raw events.
            </p>
          </div>
        </div>

        <div className="mt-5 max-w-full overflow-hidden">
          <DataTable<AgentActivityRow>
            rows={activityRows}
            getRowKey={(row) => row.id}
            enableSearch={false}
            className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm"
            tableClassName="w-full table-fixed divide-y divide-border text-sm"
            rowClassName="hover:bg-accent-soft/30"
            emptyState={
              <div className="rounded-2xl border border-dashed border-border bg-white/70 p-5 text-sm text-muted">
                No recent desktop activity events found.
              </div>
            }
columns={[
  {
    key: "expand",
    header: "",
    className: "w-[52px]",
    render: (row) =>
      row.rowType === "group" ? (
        <button
          onClick={() => toggleGroup(row.id)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border"
        >
          <ChevronDown
            className={`h-4 w-4 transition ${
              row.isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      ) : null,
  },

  {
    key: "activity",
    header: "Activity",
    className: "w-[40%]",
cellClassName: "min-w-0",
    render: (row) => {
      if (row.rowType === "detail") {
        return (
          <div className="w-full bg-surface px-5 py-4">
            <ExpandedAgentActivityEvents
              events={row.group.events}
              formatDateTime={formatDateTime}
            />
          </div>
        );
      }

      return (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {row.activeApp || "Not captured"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">
            {row.browserTabTitle || row.windowTitle || "No title"}
          </p>
        </div>
      );
    },
  },

  {
    key: "status",
    header: "Status",
    className: "w-[120px]",
    render: (row) =>
      row.rowType === "group" ? (
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${getAgentStatusClassName(
            row.state,
          )}`}
        >
          {formatAgentStatus(row.state)}
        </span>
      ) : null,
  },

  {
    key: "latest",
    header: "Latest",
    className: "w-[180px]",
    render: (row) =>
      row.rowType === "group" ? (
        <span className="text-sm text-muted">
          {formatDateTime(row.latestAt)}
        </span>
      ) : null,
  },

  {
    key: "idle",
    header: "Idle",
    className: "w-[100px]",
    render: (row) =>
      row.rowType === "group" ? (
        <span className="text-sm text-muted">
          {formatDuration(row.maxIdleSeconds)}
        </span>
      ) : null,
  },

  {
    key: "count",
    header: "Events",
    className: "w-[80px]",
    render: (row) =>
      row.rowType === "group" ? (
        <span className="text-sm text-muted">
          {row.events.length}
        </span>
      ) : null,
  },
]}
          />
        </div>

        <p className="mt-4 text-xs text-muted">
          Note: browser tab and window titles are shown only when enabled by company policy.
          This view does not track keystrokes, clipboard content, screenshots, passwords,
          or message contents.
        </p>
      </article>
    </section>
  );
}

function ExpandedAgentActivityEvents({
  events,
  formatDateTime,
}: {
  events: EmployeeAgentSummaryResponse["recentEvents"];
  formatDateTime: (value?: string | null) => string;
}) {
  return (
    <div className="w-full">
      <div className="grid gap-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="grid items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-xs md:grid-cols-[180px_100px_minmax(0,1fr)_100px]"
          >
            <div className="text-muted">
              {formatDateTime(event.occurredAt)}
            </div>

            <div>
              <span
                className={`rounded-full px-2 py-0.5 ${getAgentStatusClassName(
                  event.state,
                )}`}
              >
                {formatAgentStatus(event.state)}
              </span>
            </div>

            <div className="min-w-0">
              <p className="truncate font-medium">
                {event.activeApp || "Not captured"}
              </p>
              <p className="truncate text-muted">
                {event.browserTabTitle || event.windowTitle || "No title"}
              </p>
            </div>

            <div className="text-muted">
              {event.activeProcessId ? `PID ${event.activeProcessId}` : "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function AgentMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-white/80 px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted">{helper}</p>
    </div>
  );
}

function groupAgentActivityEvents(
  events: EmployeeAgentSummaryResponse["recentEvents"],
) {
  const groups: Array<Omit<GroupedAgentActivity, "rowType" | "isExpanded">> = [];

  for (const event of events) {
    const groupKey = [
      event.state || "",
      event.activeApp || "",
      event.browserTabTitle || "",
      event.windowTitle || "",
      event.activeProcessId || "",
    ].join("|");

    const previous = groups[groups.length - 1];
    const previousKey = previous
      ? [
          previous.state || "",
          previous.activeApp || "",
          previous.browserTabTitle || "",
          previous.windowTitle || "",
          previous.activeProcessId || "",
        ].join("|")
      : "";

    if (previous && previousKey === groupKey) {
      previous.events.push(event);
      previous.latestAt = event.occurredAt;
      previous.maxIdleSeconds = Math.max(
        previous.maxIdleSeconds,
        event.idleSeconds ?? 0,
      );
      continue;
    }

    groups.push({
      id: `${event.id}-${groups.length}`,
      state: event.state,
      activeApp: event.activeApp,
      activeAppPath: event.activeAppPath,
      browserTabTitle: event.browserTabTitle,
      windowTitle: event.windowTitle,
      activeProcessId: event.activeProcessId,
      latestAt: event.occurredAt,
      maxIdleSeconds: event.idleSeconds ?? 0,
      events: [event],
    });
  }

  return groups;
}

function formatDuration(seconds?: number | null) {
  const safeSeconds = Math.max(0, Math.floor(seconds ?? 0));

  if (safeSeconds < 60) return `${safeSeconds} sec`;

  const totalMinutes = Math.floor(safeSeconds / 60);

  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatAgentStatus(value?: string | null) {
  if (!value) return "Unknown";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAgentStatusClassName(value?: string | null) {
  switch (value) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700";
    case "IDLE":
      return "bg-amber-50 text-amber-700";
    case "AWAY":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}