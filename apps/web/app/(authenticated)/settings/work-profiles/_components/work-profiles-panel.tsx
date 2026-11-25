"use client";

import { Plus, Upload } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import type { WorkUnit } from "../_lib/work-profile-form";
import type { WorkProfileListItem } from "../_lib/work-profiles-client";
import { WorkProfileDialog } from "./work-profile-dialog";
import { WorkProfileImportDialog } from "./work-profile-import-dialog";

/** The catalogue of work profiles with create, open and import. */
export function WorkProfilesPanel({
  canManage,
  onChanged,
  profiles,
  units,
}: {
  canManage: boolean;
  onChanged: () => Promise<void>;
  profiles: WorkProfileListItem[];
  units: WorkUnit[];
}) {
  // `undefined` is closed, `null` is a new profile, a string opens that profile.
  const [opened, setOpened] = useState<string | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);

  const columns: DataTableColumn<WorkProfileListItem>[] = [
    {
      key: "name",
      header: "Profile",
      searchAccessor: (row) => `${row.name} ${row.key}`,
      sortAccessor: (row) => row.name,
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs text-muted">{row.key}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusPill tone={row.isActive ? "good" : "muted"}>
          {row.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
    {
      key: "version",
      header: "Version in force",
      render: (row) =>
        row.currentVersion ? (
          <span>
            v{row.currentVersion.version}
            {row.currentVersion.effectiveFrom
              ? ` from ${formatDate(row.currentVersion.effectiveFrom)}`
              : ""}
          </span>
        ) : (
          <StatusPill tone="warning">Not published</StatusPill>
        ),
    },
    {
      key: "draft",
      header: "Draft",
      render: (row) =>
        row.hasDraft ? <StatusPill tone="info">Open draft</StatusPill> : "",
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <Button onClick={() => setOpened(row.id)} size="xs" variant="outline">
          {canManage ? "Open" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      {canManage ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => setImporting(true)}
            variant="secondary"
          >
            Import
          </Button>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setOpened(null)}
          >
            New profile
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            action={
              canManage ? (
                <Button onClick={() => setOpened(null)}>New profile</Button>
              ) : undefined
            }
            description="A profile lists the work a role does and how each kind of work is measured."
            title="No work profiles yet"
          />
        }
        entityLogicalName="work-profiles"
        getRowKey={(row) => row.id}
        rows={profiles}
        searchPlaceholder="Search profiles"
      />

      <WorkProfileDialog
        canManage={canManage}
        onChanged={() => void onChanged()}
        onClose={() => setOpened(undefined)}
        open={opened !== undefined}
        profileId={opened ?? null}
        units={units}
      />
      <WorkProfileImportDialog
        onChanged={onChanged}
        onClose={() => setImporting(false)}
        open={importing}
      />
    </div>
  );
}
