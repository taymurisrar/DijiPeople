"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Edit, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { ProjectRecord } from "../types";

type ProjectAssignment =
  ProjectRecord["assignedEmployees"][number];

type ProjectAssignmentsSubgridProps = {
  project: ProjectRecord;
  canAssignProject?: boolean;
};

export function ProjectAssignmentsSubgrid({
  project,
  canAssignProject = false,
}: ProjectAssignmentsSubgridProps) {
  const rows = project.assignedEmployees ?? [];
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>(
    [],
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("project-assignments:selected-ids-changed", {
        detail: {
          ids: selectedAssignmentIds,
          count: selectedAssignmentIds.length,
        },
      }),
    );
  }, [selectedAssignmentIds]);

  const columns: DataTableColumn<ProjectAssignment>[] = [
    {
      key: "employee",
      header: "Employee",
      sortable: true,
      filterable: true,
      filterType: "text",
      sortAccessor: (assignment) => assignment.employee.fullName,
      filterAccessor: (assignment) =>
        `${assignment.employee.fullName} ${assignment.employee.employeeCode ?? ""}`,
      render: (assignment) => (
        <div>
          <Link
            href={`/employees/${assignment.employee.id}`}
            className="font-semibold text-foreground transition hover:text-accent"
          >
            {assignment.employee.fullName}
          </Link>
          <p className="mt-1 text-muted">
            {assignment.employee.employeeCode || "No employee code"}
          </p>

          {assignment.utilizationWarning ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              {assignment.utilizationWarning}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "roleOnProject",
      header: "Role",
      sortable: true,
      filterable: true,
      filterType: "text",
      sortAccessor: (assignment) => assignment.roleOnProject ?? "",
      filterAccessor: (assignment) => assignment.roleOnProject ?? "",
      cellClassName: "text-muted",
      render: (assignment) => assignment.roleOnProject || "Not set",
    },
    {
      key: "allocation",
      header: "Allocation",
      sortable: true,
      filterable: true,
      filterType: "number",
      sortAccessor: (assignment) =>
        assignment.allocationPercent ?? assignment.allocationHours ?? 0,
      filterAccessor: (assignment) =>
        String(assignment.allocationPercent ?? assignment.allocationHours ?? ""),
      cellClassName: "text-muted",
      render: (assignment) =>
        assignment.allocationPercent != null
          ? `${assignment.allocationPercent}%`
          : assignment.allocationHours != null
            ? `${assignment.allocationHours} hour(s)`
            : "Not set",
    },
    {
      key: "allocationType",
      header: "Type",
      sortable: true,
      filterable: true,
      filterType: "select",
      filterOptions: [
        { label: "Percentage", value: "PERCENTAGE" },
        { label: "Hours", value: "HOURS" },
      ],
      sortAccessor: (assignment) => assignment.allocationType ?? "",
      filterAccessor: (assignment) => assignment.allocationType ?? "",
      cellClassName: "text-muted",
      render: (assignment) => assignment.allocationType || "Not set",
    },
    {
      key: "billing",
      header: "Billing",
      sortable: true,
      filterable: true,
      filterType: "select",
      filterOptions: [
        { label: "Billable", value: "Billable" },
        { label: "Non-billable", value: "Non-billable" },
      ],
      sortAccessor: (assignment) => (assignment.billableFlag ? 1 : 0),
      filterAccessor: (assignment) =>
        assignment.billableFlag ? "Billable" : "Non-billable",
      cellClassName: "text-muted",
      render: (assignment) =>
        assignment.billableFlag ? "Billable" : "Non-billable",
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      filterable: true,
      filterType: "select",
      filterOptions: [
        { label: "Active", value: "ACTIVE" },
        { label: "Inactive", value: "INACTIVE" },
      ],
      sortAccessor: (assignment) => assignment.status ?? "ACTIVE",
      filterAccessor: (assignment) => assignment.status ?? "ACTIVE",
      render: (assignment) => (
        <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold uppercase text-muted">
          {assignment.status ?? "ACTIVE"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      sortable: false,
      filterable: false,
      render: (assignment) => (
        <Link
          href={`/projects/${project.id}/assignments/${assignment.id}/edit`}
          className="text-sm font-semibold text-accent transition hover:text-accent-strong"
        >
          Edit
        </Link>
      ),
    },
  ];

  return (
    <section className="grid gap-3">
      <div className="rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Project Assignments
            </h2>
          </div>

<div className="flex flex-wrap items-center gap-2">
  {canAssignProject ? (
    <Button
      href={`/projects/${project.id}/assignments/new`}
      variant="primary"
      size="xs"
      leftIcon={<Plus className="h-4 w-4" />}
    >
      New assignment
    </Button>
  ) : null}

  <Button
    href={`/projects/${project.id}?tab=assignments`}
    variant="secondary"
    size="xs"
    leftIcon={<RefreshCcw className="h-4 w-4" />}
  >
    Refresh
  </Button>

  {selectedAssignmentIds.length > 0 ? (
    <>
      <Button
        href={`/projects/${project.id}/assignments/${selectedAssignmentIds[0]}/edit`}
        variant="secondary"
        size="xs"
        leftIcon={<Edit className="h-4 w-4" />}
      >
        Edit
      </Button>

<Button
  type="button"
  variant="danger"
  size="xs"
  leftIcon={<Trash2 className="h-4 w-4" />}
>
  Remove
</Button>
    </>
  ) : null}
</div>
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(assignment) => assignment.id}
          emptyState={
            <div className="p-8 text-sm text-muted">
              No project assignments found.
            </div>
          }
          enableSearch
          searchPlaceholder="Search assignments"
          enableSelection
          selectedRowKeys={selectedAssignmentIds}
          onSelectedRowKeysChange={setSelectedAssignmentIds}
          initialSort={{
            columnKey: "employee",
            direction: "asc",
          }}
          className="overflow-hidden rounded-none border-0 bg-transparent shadow-none"
        />
      </div>
    </section>
  );
}