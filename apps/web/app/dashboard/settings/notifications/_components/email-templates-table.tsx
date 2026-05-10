"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  EmailTemplate,
  activateEmailTemplate,
  archiveEmailTemplate,
  cloneEmailTemplate,
} from "@/lib/notifications-api";
import { formatDateTime, StatusBadge } from "./notification-ui";

export function EmailTemplatesTable({
  canManage,
  templates,
}: {
  canManage: boolean;
  templates: EmailTemplate[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(
    template: EmailTemplate,
    action: "clone" | "activate" | "archive",
  ) {
    if (action === "archive" && !confirm("Archive this email template?")) {
      return;
    }

    setError(null);
    setBusyId(`${action}:${template.id}`);
    try {
      if (action === "clone") await cloneEmailTemplate(template.id);
      if (action === "activate") await activateEmailTemplate(template.id);
      if (action === "archive") await archiveEmailTemplate(template.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template action failed.");
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo<DataTableColumn<EmailTemplate>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        searchable: true,
        sortable: true,
        render: (template) => (
          <div>
            <Link
              className="font-semibold text-foreground hover:text-accent"
              href={`/dashboard/settings/notifications/templates/${template.id}`}
            >
              {template.name}
            </Link>
            <div className="mt-1 font-mono text-xs text-muted">
              {template.eventCode}
            </div>
          </div>
        ),
      },
      {
        key: "templateKey",
        header: "Template Key",
        searchable: true,
        sortable: true,
        render: (template) => template.templateKey,
      },
      {
        key: "status",
        header: "Status",
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "Active", value: "ACTIVE" },
          { label: "Draft", value: "DRAFT" },
          { label: "Archived", value: "ARCHIVED" },
        ],
        filterAccessor: (template) => template.status,
        render: (template) => <StatusBadge status={template.status} />,
      },
      {
        key: "scope",
        header: "Scope",
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "System", value: "System" },
          { label: "Tenant", value: "Tenant" },
        ],
        filterAccessor: (template) => (template.isSystem ? "System" : "Tenant"),
        render: (template) => (template.isSystem ? "System" : "Tenant"),
      },
      {
        key: "version",
        header: "Version",
        sortable: true,
        render: (template) => `v${template.version}`,
      },
      {
        key: "updatedAt",
        header: "Updated",
        sortable: true,
        sortAccessor: (template) => new Date(template.updatedAt),
        render: (template) => formatDateTime(template.updatedAt),
      },
      {
        key: "actions",
        header: "Actions",
        render: (template) => (
          <div className="flex flex-wrap gap-2">
            <Button
              href={`/dashboard/settings/notifications/templates/${template.id}`}
              size="sm"
              variant="secondary"
            >
              {template.isSystem ? "View" : "Edit"}
            </Button>
            {template.isSystem ? (
              <Button
                disabled={!canManage}
                loading={busyId === `clone:${template.id}`}
                onClick={() => mutate(template, "clone")}
                size="sm"
                variant="secondary"
              >
                Clone
              </Button>
            ) : (
              <>
                <Button
                  disabled={!canManage || template.status === "ACTIVE"}
                  loading={busyId === `activate:${template.id}`}
                  onClick={() => mutate(template, "activate")}
                  size="sm"
                  variant="secondary"
                >
                  Activate
                </Button>
                <Button
                  disabled={!canManage || template.status === "ARCHIVED"}
                  loading={busyId === `archive:${template.id}`}
                  onClick={() => mutate(template, "archive")}
                  size="sm"
                  variant="danger"
                >
                  Archive
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [busyId, canManage],
  );

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            description="No email templates are available yet. System template seed data may need to be run."
            title="No email templates"
          />
        }
        getRowKey={(template) => template.id}
        rows={templates}
        searchPlaceholder="Search templates, keys, or event codes"
      />
    </div>
  );
}
