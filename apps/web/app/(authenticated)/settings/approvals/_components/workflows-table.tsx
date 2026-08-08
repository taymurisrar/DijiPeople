"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import type { TemplateScopeOptions } from "@/lib/notifications-api";
import {
  Workflow,
  WorkflowBuilderOptions,
  deleteWorkflow,
  updateWorkflow,
} from "@/lib/workflows-api";
import { describeScope } from "../../_components/scope-picker";
import { StatusBadge } from "../../notifications/_components/notification-ui";

export function WorkflowsTable({
  canManage,
  options,
  workflows,
}: {
  canManage: boolean;
  options: WorkflowBuilderOptions;
  workflows: Workflow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = useMemo<TemplateScopeOptions>(
    () => ({
      levels: options.levels,
      organizations: options.organizations,
      businessUnits: options.businessUnits,
      departments: options.departments,
      teams: options.teams,
      modules: options.modules,
    }),
    [options],
  );

  async function mutate(workflow: Workflow, action: "toggle" | "delete") {
    if (
      action === "delete" &&
      !confirm(`Delete "${workflow.name}"? This cannot be undone.`)
    ) {
      return;
    }

    setError(null);
    setBusyId(`${action}:${workflow.id}`);
    try {
      if (action === "delete") {
        await deleteWorkflow(workflow.id);
      } else {
        await updateWorkflow(workflow.id, {
          status: workflow.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action failed.");
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo<DataTableColumn<Workflow>[]>(
    () => [
      {
        key: "name",
        header: "Workflow",
        searchable: true,
        sortable: true,
        render: (workflow) => (
          <div>
            <Link
              className="font-semibold text-foreground hover:text-accent"
              href={`/settings/approvals/templates/workflow-templates/${workflow.id}`}
            >
              {workflow.name}
            </Link>
            {workflow.description ? (
              <div className="mt-1 text-xs text-muted">
                {workflow.description}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: "eventCode",
        header: "Trigger",
        searchable: true,
        sortable: true,
        render: (workflow) =>
          options.events.find((event) => event.value === workflow.eventCode)
            ?.label ?? workflow.eventCode,
      },
      {
        key: "status",
        header: "Status",
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "Active", value: "ACTIVE" },
          { label: "Draft", value: "DRAFT" },
          { label: "Paused", value: "INACTIVE" },
        ],
        filterAccessor: (workflow) => workflow.status,
        render: (workflow) => <StatusBadge status={workflow.status} />,
      },
      {
        key: "scope",
        header: "Applies To",
        sortable: true,
        sortAccessor: (workflow) =>
          describeScope(workflow.scopeLevel, workflow.scopeId, scopeOptions),
        render: (workflow) =>
          describeScope(workflow.scopeLevel, workflow.scopeId, scopeOptions),
      },
      {
        key: "moduleKey",
        header: "Module",
        sortable: true,
        sortAccessor: (workflow) => workflow.moduleKey ?? "",
        render: (workflow) =>
          options.modules.find((module) => module.value === workflow.moduleKey)
            ?.label ??
          workflow.moduleKey ??
          "All modules",
      },
      {
        key: "actions",
        header: "Sends",
        render: (workflow) =>
          `${workflow.actions.length} email${workflow.actions.length === 1 ? "" : "s"}`,
      },
      {
        key: "runCount",
        header: "Runs",
        sortable: true,
        render: (workflow) => workflow.runCount,
      },
      {
        key: "rowActions",
        header: "Actions",
        render: (workflow) => (
          <div className="flex flex-wrap gap-2">
            <Button
              href={`/settings/approvals/templates/workflow-templates/${workflow.id}`}
              size="sm"
              variant="secondary"
            >
              Edit
            </Button>
            <Button
              disabled={!canManage || workflow.status === "DRAFT"}
              loading={busyId === `toggle:${workflow.id}`}
              onClick={() => mutate(workflow, "toggle")}
              size="sm"
              variant="secondary"
            >
              {workflow.status === "ACTIVE" ? "Pause" : "Resume"}
            </Button>
            <Button
              disabled={!canManage}
              loading={busyId === `delete:${workflow.id}`}
              onClick={() => mutate(workflow, "delete")}
              size="sm"
              variant="danger"
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [busyId, canManage, options, scopeOptions],
  );

  return (
    <div className="grid gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button
            href="/settings/approvals/templates/workflow-templates/new"
            size="sm"
          >
            New Workflow
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            description="A workflow sends email automatically when something happens, such as leave being submitted. Create one to get started."
            title="No workflows yet"
          />
        }
        getRowKey={(workflow) => workflow.id}
        rows={workflows}
        searchPlaceholder="Search workflows or triggers"
      />
    </div>
  );
}
