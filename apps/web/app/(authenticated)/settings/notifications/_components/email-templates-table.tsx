"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import type { TemplateScopeOptions } from "@/lib/notifications-api";
import { describeScope } from "../../_components/scope-picker";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";
import {
  activateTemplate,
  archiveTemplate,
  customizeTemplate,
  type ListedEmailTemplate,
} from "../templates/_lib/email-template-client";
import { ErrorBanner, formatDateTime, StatusBadge } from "./notification-ui";

/*
 * ITEM-0181. The key is printed once, under the name. It used to appear as a
 * subtitle and again in its own column, which with a Module and a Version
 * column pushed the table past 1440px and cut off the last column. Module now
 * reads as part of "Applies to", which is where it narrows a template.
 */
export function EmailTemplatesTable({
  canManage,
  scopeOptions,
  templates,
}: {
  canManage: boolean;
  scopeOptions: TemplateScopeOptions | null;
  templates: ListedEmailTemplate[];
}) {
  const router = useRouter();
  // Same hydration fix as the providers screen — see formatDateTime in
  // notification-ui: the module default is installed by an effect and is empty
  // during server rendering.
  const formatting = useFormattingContext();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ListedEmailTemplate | null>(
    null,
  );

  async function run(
    template: ListedEmailTemplate,
    action: "customize" | "activate" | "archive",
  ) {
    setError(null);
    setBusyId(`${action}:${template.id}`);
    try {
      if (action === "customize") {
        const copy = await customizeTemplate(template.id);
        router.push(`/settings/notifications/templates/${copy.id}`);
        return;
      }
      if (action === "activate") await activateTemplate(template.id);
      if (action === "archive") await archiveTemplate(template.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template action failed.");
    } finally {
      setBusyId(null);
      setArchiveTarget(null);
    }
  }

  const columns = useMemo<DataTableColumn<ListedEmailTemplate>[]>(() => {
    const moduleLabel = (key: string) =>
      scopeOptions?.modules.find((module) => module.value === key)?.label ?? key;
    const appliesTo = (template: ListedEmailTemplate) =>
      [
        describeScope(template.scopeLevel, template.scopeId, scopeOptions),
        template.moduleKey ? moduleLabel(template.moduleKey) : null,
      ]
        .filter(Boolean)
        .join(" · ");

    return [
      {
        key: "name",
        header: "Template",
        searchable: true,
        sortable: true,
        searchAccessor: (template) => `${template.name} ${template.templateKey}`,
        render: (template) => (
          <div className="min-w-0 max-w-xs">
            <Link
              className="font-semibold text-foreground hover:text-accent"
              href={`/settings/notifications/templates/${template.id}`}
            >
              {template.name}
            </Link>
            <div className="mt-1 break-all font-mono text-xs text-muted">
              {template.templateKey}
            </div>
          </div>
        ),
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
        header: "Applies to",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "System default", value: "SYSTEM" },
          { label: "Whole tenant", value: "TENANT" },
          { label: "Organization", value: "ORGANIZATION" },
          { label: "Business unit", value: "BUSINESS_UNIT" },
          { label: "Department", value: "DEPARTMENT" },
          { label: "Team", value: "TEAM" },
        ],
        filterAccessor: (template) => template.scopeLevel,
        sortAccessor: appliesTo,
        render: (template) => (
          <span className="block min-w-0 max-w-[14rem] break-words">
            {appliesTo(template)}
          </span>
        ),
      },
      {
        key: "updatedAt",
        header: "Updated",
        sortable: true,
        sortAccessor: (template) => new Date(template.updatedAt),
        render: (template) => formatDateTime(template.updatedAt, formatting),
      },
      {
        key: "actions",
        header: "Actions",
        render: (template) => (
          <div className="flex flex-wrap gap-2">
            <Button
              href={`/settings/notifications/templates/${template.id}`}
              size="sm"
              variant="secondary"
            >
              {template.isSystem || !canManage ? "View" : "Edit"}
            </Button>
            {template.isSystem ? (
              template.customizable && canManage ? (
                <Button
                  loading={busyId === `customize:${template.id}`}
                  onClick={() => run(template, "customize")}
                  size="sm"
                  variant="secondary"
                >
                  Customize
                </Button>
              ) : null
            ) : canManage ? (
              <>
                {template.status !== "ACTIVE" ? (
                  <Button
                    loading={busyId === `activate:${template.id}`}
                    onClick={() => run(template, "activate")}
                    size="sm"
                    variant="secondary"
                  >
                    Activate
                  </Button>
                ) : null}
                {template.status !== "ARCHIVED" ? (
                  <Button
                    onClick={() => setArchiveTarget(template)}
                    size="sm"
                    variant="danger-soft"
                  >
                    Archive
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        ),
      },
    ];
    // `run` only closes over setters and the router, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyId, canManage, formatting, scopeOptions]);

  return (
    <div className="grid gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button href="/settings/notifications/templates/new" size="sm">
            New Template
          </Button>
        </div>
      ) : null}
      <ErrorBanner message={error} />
      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            description="Create a template, or customize a system default."
            title="No email templates"
          />
        }
        getRowKey={(template) => template.id}
        rows={templates}
        searchPlaceholder="Search templates"
      />
      <ConfirmDialog
        confirmAction={{
          label: "Archive",
          onClick: () => (archiveTarget ? run(archiveTarget, "archive") : undefined),
          variant: "danger",
        }}
        isLoading={Boolean(archiveTarget && busyId === `archive:${archiveTarget.id}`)}
        onClose={() => setArchiveTarget(null)}
        open={archiveTarget !== null}
        title={archiveTarget ? `Archive ${archiveTarget.name}?` : "Archive template?"}
      />
    </div>
  );
}
