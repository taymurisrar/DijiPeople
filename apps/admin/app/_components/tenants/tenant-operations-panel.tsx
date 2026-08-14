"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { formatDate, formatDateTime, formatEnumLabel } from "@/lib/formatters";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import {
  DefinitionList,
  PanelButton,
  PanelCard,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
  formatDuration,
  relativeTime,
} from "./tenant-panel-ui";
import {
  describeError,
  tenantRequest,
  useTenantResource,
  type TenantOperationsView,
  type TenantProvisioningStep,
} from "./tenant-control-plane.client";

const STEP_TONE: Record<
  string,
  "success" | "neutral" | "warning" | "danger" | "info"
> = {
  SUCCEEDED: "success",
  FAILED: "danger",
  RUNNING: "info",
  PENDING: "neutral",
  SKIPPED: "neutral",
};

type SupportCase = TenantOperationsView["supportCases"][number];

/**
 * Operations.
 *
 * Provisioning history, support load and background job outcomes — all read from
 * records the platform writes. There are no synthetic infrastructure tiles here:
 * if DijiPeople does not measure something for this tenant, this tab does not
 * claim to know it.
 */
export function TenantOperationsPanel({
  tenantId,
  retryRequested,
  onRetryHandled,
}: {
  tenantId: string;
  retryRequested?: boolean;
  onRetryHandled?: () => void;
}) {
  const { data, loading, error, reload, setData } =
    useTenantResource<TenantOperationsView>(tenantId, "/operations");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await tenantRequest<TenantOperationsView>(
        tenantId,
        "/operations/retry-provisioning",
        {
          method: "POST",
          body: JSON.stringify({
            reason: "Retried from the tenant Operations tab.",
          }),
        },
      );
      setData(next);
      setMessage({
        tone: "success",
        text: "Provisioning retry completed. The tenant is ready for configuration.",
      });
    } catch (reason) {
      setMessage({
        tone: "error",
        text: describeError(reason, "The provisioning retry failed."),
      });
      reload();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!retryRequested) return;
    onRetryHandled?.();
    void retry();
    // The parent asks once; retry() closes over stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryRequested]);

  if (loading && !data)
    return (
      <PanelCard title="Operations">
        <PanelLoading label="tenant operations" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Operations">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  const { provisioning } = data;
  const tenantFilter = encodeURIComponent(
    JSON.stringify([{ field: "tenantId", operator: "eq", value: tenantId }]),
  );

  return (
    <div className="space-y-5">
      {message ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <PanelCard
        title="Provisioning"
        description="The most recent attempt to build this workspace."
        actions={
          <PanelButton
            variant="primary"
            busy={busy}
            disabled={!provisioning.canRetry}
            title={provisioning.retryBlockedReason ?? undefined}
            onClick={() => void retry()}
          >
            Retry provisioning
          </PanelButton>
        }
      >
        {provisioning.hasRecordedRuns ? (
          <DefinitionList
            columns={3}
            items={[
              {
                label: "State",
                value: (
                  <StatePill
                    value={provisioning.status ?? "Unknown"}
                    tone={
                      provisioning.status === "SUCCEEDED"
                        ? "success"
                        : provisioning.status === "FAILED"
                          ? "danger"
                          : "info"
                    }
                  />
                ),
              },
              {
                label: "Attempt",
                value: provisioning.attempt ?? "—",
              },
              {
                label: "Duration",
                value: formatDuration(provisioning.durationMs),
              },
              {
                label: "Started",
                value: provisioning.startedAt
                  ? formatDateTime(provisioning.startedAt)
                  : "—",
              },
              {
                label: "Completed",
                value: provisioning.completedAt
                  ? formatDateTime(provisioning.completedAt)
                  : "Still running",
              },
              {
                label: "Failed step",
                value: provisioning.failedStepKey
                  ? formatEnumLabel(provisioning.failedStepKey)
                  : "None",
                hint: provisioning.message ?? undefined,
              },
            ]}
          />
        ) : (
          <PanelEmptyState
            title="No provisioning run has been recorded for this tenant."
            description="Run history began when the tenant control plane was introduced. Tenants provisioned before that show their result on the workspace and subscription instead."
          />
        )}
        {provisioning.retryBlockedReason ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {provisioning.retryBlockedReason}
          </p>
        ) : (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            A retry replays only the steps that are safe to re-run — workspace
            domain, roles and customization defaults. Owner, subscription and
            invoice creation are never repeated.
          </p>
        )}
      </PanelCard>

      <PanelCard
        title="Provisioning history"
        description="Each run and the steps it executed."
      >
        {data.provisioningRuns.length ? (
          <div className="space-y-4">
            {data.provisioningRuns.map((run) => (
              <div
                key={run.id}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatePill
                      value={run.status}
                      tone={
                        run.status === "SUCCEEDED"
                          ? "success"
                          : run.status === "FAILED"
                            ? "danger"
                            : "info"
                      }
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Attempt {run.attempt} · {formatEnumLabel(run.trigger)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatDateTime(run.startedAt)} ·{" "}
                    {formatDuration(run.durationMs)}
                  </span>
                </div>
                <ProDataTable
                  rows={run.steps}
                  rowKey={(row) => row.id}
                  compact
                  columns={stepColumns}
                />
              </div>
            ))}
          </div>
        ) : (
          <PanelEmptyState
            title="No provisioning runs to show."
            description="Steps are recorded from the moment provisioning starts, including retries."
          />
        )}
      </PanelCard>

      <PanelCard
        title="Support cases"
        description="Support raised against this tenant."
        actions={
          <Link
            href={`/support/cases?filters=${tenantFilter}`}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            View all
          </Link>
        }
      >
        {data.supportCases.length ? (
          <ProDataTable
            rows={data.supportCases}
            rowKey={(row) => row.id}
            compact
            columns={supportColumns}
          />
        ) : (
          <PanelEmptyState
            title="No support cases are currently associated with this tenant."
            description="Cases raised by this customer against this workspace appear here."
          />
        )}
      </PanelCard>

      <PanelCard
        title="Background processing"
        description="Import, export and data jobs run inside this tenant."
      >
        {data.jobs.byStatus.length ? (
          <div className="flex flex-wrap gap-2">
            {data.jobs.byStatus.map((entry) => (
              <StatePill
                key={entry.status}
                value={`${formatEnumLabel(entry.status)} · ${entry.count}`}
                tone={
                  entry.status === "FAILED"
                    ? "danger"
                    : entry.status === "PROCESSING"
                      ? "info"
                      : entry.status === "COMPLETED"
                        ? "success"
                        : "neutral"
                }
              />
            ))}
          </div>
        ) : (
          <PanelEmptyState
            title="No background jobs have run for this tenant."
            description="Data imports and exports started inside the tenant application are summarised here."
          />
        )}
      </PanelCard>
    </div>
  );
}

const stepColumns: ProDataTableColumn<TenantProvisioningStep>[] = [
  {
    key: "label",
    header: "Step",
    minWidth: 240,
    render: (row) => (
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{row.label}</p>
        {row.message ? (
          <p className="text-xs text-slate-500">{row.message}</p>
        ) : null}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    minWidth: 130,
    render: (row) => (
      <StatePill value={row.status} tone={STEP_TONE[row.status] ?? "neutral"} />
    ),
  },
  {
    key: "startedAt",
    header: "Started",
    minWidth: 170,
    render: (row) => (row.startedAt ? formatDateTime(row.startedAt) : "—"),
  },
  {
    key: "completedAt",
    header: "Completed",
    minWidth: 170,
    render: (row) => (row.completedAt ? formatDateTime(row.completedAt) : "—"),
  },
  {
    key: "durationMs",
    header: "Duration",
    minWidth: 110,
    render: (row) => formatDuration(row.durationMs),
  },
  {
    key: "isRetryable",
    header: "Retryable",
    minWidth: 120,
    render: (row) => (
      <StatePill
        value={row.isRetryable ? "Yes" : "No"}
        tone={row.isRetryable ? "success" : "neutral"}
      />
    ),
  },
];

const supportColumns: ProDataTableColumn<SupportCase>[] = [
  {
    key: "caseNumber",
    header: "Case #",
    minWidth: 130,
    render: (row) => (
      <Link
        href={`/support/cases/${row.id}`}
        className="font-medium text-[var(--admin-primary)] hover:underline"
      >
        {row.caseNumber}
      </Link>
    ),
  },
  {
    key: "title",
    header: "Title",
    minWidth: 240,
    render: (row) => row.title,
  },
  {
    key: "status",
    header: "Status",
    minWidth: 150,
    render: (row) => <TenantStatusBadge value={row.status} />,
  },
  {
    key: "priority",
    header: "Priority",
    minWidth: 120,
    render: (row) => formatEnumLabel(row.priority),
  },
  {
    key: "severity",
    header: "Severity",
    minWidth: 130,
    render: (row) => formatEnumLabel(row.severity),
  },
  {
    key: "resolutionDueAt",
    header: "SLA due",
    minWidth: 150,
    render: (row) =>
      row.resolutionDueAt ? (
        row.resolvedAt ? (
          <StatePill value="Met" tone="success" />
        ) : new Date(row.resolutionDueAt).getTime() < Date.now() ? (
          <StatePill value="Breached" tone="danger" />
        ) : (
          relativeTime(row.resolutionDueAt)
        )
      ) : (
        "No target"
      ),
  },
  {
    key: "createdAt",
    header: "Created",
    minWidth: 140,
    render: (row) => formatDate(row.createdAt),
  },
];
