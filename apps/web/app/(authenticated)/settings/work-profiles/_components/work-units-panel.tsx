"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SelectField, TextField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  WORK_KEY_PATTERN,
  WORK_UNIT_KINDS,
  WORK_UNIT_KIND_LABELS,
  keyFromName,
  type WorkUnit,
  type WorkUnitKind,
} from "../_lib/work-profile-form";
import { workProfilesRequest } from "../_lib/work-profiles-client";

const KIND_OPTIONS = WORK_UNIT_KINDS.map((kind) => ({
  value: kind,
  label: WORK_UNIT_KIND_LABELS[kind],
}));

type Editing = { mode: "create" } | { mode: "rename"; unit: WorkUnit };

/**
 * Work units: what a work type is counted in. A unit's key and kind are fixed
 * once created (changing either would change what published versions mean), so
 * the only edits are the display name and active state.
 */
export function WorkUnitsPanel({
  canManage,
  onChanged,
  units,
}: {
  canManage: boolean;
  onChanged: () => Promise<void>;
  units: WorkUnit[];
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<WorkUnitKind>("COUNT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (next: Editing) => {
    setError(null);
    setEditing(next);
    if (next.mode === "create") {
      setKey("");
      setName("");
      setKind("COUNT");
    } else {
      setKey(next.unit.key);
      setName(next.unit.name);
      setKind(next.unit.kind);
    }
  };

  const submit = async () => {
    if (!editing) return;
    if (!name.trim()) {
      setError("A unit needs a name.");
      return;
    }
    if (editing.mode === "create" && !WORK_KEY_PATTERN.test(key.trim())) {
      setError(
        'The key must be 2-64 characters of a-z, 0-9, ".", "_" or "-".',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing.mode === "create") {
        await workProfilesRequest("/units", {
          method: "POST",
          body: { key: key.trim(), name: name.trim(), kind },
        });
      } else {
        await workProfilesRequest(`/units/${editing.unit.id}`, {
          method: "PATCH",
          body: { name: name.trim() },
        });
      }
      await onChanged();
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (unit: WorkUnit) => {
    setBusy(true);
    setError(null);
    try {
      await workProfilesRequest(`/units/${unit.id}`, {
        method: "PATCH",
        body: { isActive: !unit.isActive },
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<WorkUnit>[] = [
    {
      key: "name",
      header: "Unit",
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
      key: "kind",
      header: "Kind",
      render: (row) => WORK_UNIT_KIND_LABELS[row.kind],
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
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            render: (row: WorkUnit) => (
              <div className="flex gap-2">
                <Button
                  onClick={() => open({ mode: "rename", unit: row })}
                  size="xs"
                  variant="outline"
                >
                  Rename
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void toggleActive(row)}
                  size="xs"
                  variant="outline"
                >
                  {row.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ),
          } satisfies DataTableColumn<WorkUnit>,
        ]
      : []),
  ];

  return (
    <div className="grid gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => open({ mode: "create" })}
          >
            New unit
          </Button>
        </div>
      ) : null}
      {error && !editing ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            action={
              canManage ? (
                <Button onClick={() => open({ mode: "create" })}>New unit</Button>
              ) : undefined
            }
            description="Work types are counted in a unit, such as hours, calls or duties."
            title="No work units yet"
          />
        }
        entityLogicalName="work-units"
        getRowKey={(row) => row.id}
        rows={units}
        searchPlaceholder="Search units"
      />

      <Dialog
        busy={busy}
        footer={
          <>
            <Button onClick={() => setEditing(null)} variant="secondary">
              Cancel
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              {editing?.mode === "create" ? "Create unit" : "Save"}
            </Button>
          </>
        }
        onClose={() => setEditing(null)}
        open={editing !== null}
        title={editing?.mode === "create" ? "New work unit" : "Rename work unit"}
      >
        <div className="grid gap-4">
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <TextField
            label="Name"
            onChange={(value) => {
              if (editing?.mode === "create" && key === keyFromName(name)) {
                setKey(keyFromName(value));
              }
              setName(value);
            }}
            required
            value={name}
          />
          <TextField
            disabled={editing?.mode !== "create"}
            label="Key"
            onChange={setKey}
            required
            value={key}
          />
          <SelectField
            disabled={editing?.mode !== "create"}
            label="Kind"
            onChange={(value) => setKind(value as WorkUnitKind)}
            options={KIND_OPTIONS}
            value={kind}
          />
        </div>
      </Dialog>
    </div>
  );
}
