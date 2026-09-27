"use client";

import Link from "next/link";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import type { OnboardingTemplateRecord } from "../types";

export function OnboardingTemplatesList({
  templates,
}: {
  templates: OnboardingTemplateRecord[];
}) {
  if (!templates.length) {
    return (
      <EmptyState
        title="No onboarding templates yet"
        description="Create a template to define the tasks a new hire's onboarding starts with."
      />
    );
  }

  const columns: DataTableColumn<OnboardingTemplateRecord>[] = [
    {
      key: "name",
      header: "Template",
      sortable: true,
      searchable: true,
      render: (template) => (
        <div>
          <p className="font-semibold text-foreground">{template.name}</p>
          {template.description ? (
            <p className="mt-1 text-sm text-muted">{template.description}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "taskCount",
      header: "Tasks",
      sortable: true,
      sortAccessor: (template) => template.taskBlueprints.length,
      render: (template) => template.taskBlueprints.length,
    },
    {
      key: "isDefault",
      header: "Default",
      render: (template) => (
        <StatusPill tone={template.isDefault ? "info" : "muted"}>
          {template.isDefault ? "Default" : "Not default"}
        </StatusPill>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      render: (template) => (
        <StatusPill tone={template.isActive ? "good" : "danger"}>
          {template.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (template) => (
        <Link
          className="text-sm font-medium text-accent transition hover:text-accent-strong"
          href={`/onboarding/templates/${template.id}/edit`}
        >
          Edit
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      getRowKey={(template) => template.id}
      rows={templates}
      searchPlaceholder="Search templates"
    />
  );
}
