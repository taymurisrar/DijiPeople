"use client";

import { useMemo, useState } from "react";
import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import {
  AccessPermissionRecord,
  AccessRoleRecord,
} from "../types";

type RoleEditorMode = "view" | "create" | "edit" | "clone";

type RoleEditorState = {
  description: string;
  id?: string;
  name: string;
  permissionIds: string[];
};

type RoleRow = AccessRoleRecord & {
  miscPermissionCount: number;
  permissionCount: number;
  privilegeCount: number;
  statusLabel: string;
  typeLabel: string;
  userCount: number;
};

export function RolesCatalog({
  initialPermissions,
  initialRoles,
  roleRouteBase = "/settings/security-access/authorization/roles",
}: {
  initialPermissions: AccessPermissionRecord[];
  initialRoles: AccessRoleRecord[];
  roleRouteBase?: string;
}) {
  const [roles, setRoles] = useState(initialRoles);
  const [mode, setMode] = useState<RoleEditorMode>("view");
  const [permissionQuery, setPermissionQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(
    initialRoles[0]?.id ?? "",
  );
  const [editor, setEditor] = useState<RoleEditorState>(() =>
    roleToEditor(initialRoles[0]),
  );

  const rows = useMemo<RoleRow[]>(
    () =>
      roles
        .map((role) => ({
          ...role,
          miscPermissionCount:
            role.miscPermissions?.filter((permission) => permission.enabled)
              .length ?? 0,
          permissionCount: role.rolePermissions.length,
          privilegeCount:
            role.rolePrivileges?.filter(
              (privilege) => privilege.accessLevel !== "NONE",
            ).length ?? 0,
          statusLabel: role.isActive === false ? "Inactive" : "Active",
          typeLabel: role.isSystem ? "System" : "Custom",
          userCount: role.userRoles?.length ?? 0,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [roles],
  );

  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;
  const canMutateSelected =
    mode !== "view" && (!selectedRole || !selectedRole.isSystem);

  const filteredPermissionGroups = useMemo(() => {
    const normalizedQuery = permissionQuery.trim().toLowerCase();
    const filtered = normalizedQuery
      ? initialPermissions.filter((permission) =>
          [
            permission.name,
            permission.key,
            permission.description,
            startCase(permission.key.split(".")[0] ?? "general"),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : initialPermissions;

    const groups = new Map<string, AccessPermissionRecord[]>();
    filtered.forEach((permission) => {
      const moduleName = startCase(permission.key.split(".")[0] ?? "general");
      groups.set(moduleName, [...(groups.get(moduleName) ?? []), permission]);
    });

    return Array.from(groups.entries())
      .map(([label, items]) => ({
        label,
        items: items.sort((left, right) => left.key.localeCompare(right.key)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [initialPermissions, permissionQuery]);

  const columns: DataTableColumn<RoleRow>[] = [
      {
        key: "name",
        header: "Role",
        sortable: true,
        searchable: true,
        render: (row) => (
          <div className="min-w-[220px]">
            <p className="font-semibold text-foreground">{row.name}</p>
            <p className="mt-1 text-xs text-muted">{row.key}</p>
          </div>
        ),
        sortAccessor: (row) => row.name,
        searchAccessor: (row) => `${row.name} ${row.key} ${row.description ?? ""}`,
      },
      {
        key: "type",
        header: "Type",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "System", value: "System" },
          { label: "Custom", value: "Custom" },
        ],
        render: (row) => badge(row.typeLabel),
        sortAccessor: (row) => row.typeLabel,
        filterAccessor: (row) => row.typeLabel,
      },
      {
        key: "permissions",
        header: "Access",
        sortable: true,
        render: (row) => (
          <div className="min-w-[180px] text-sm">
            <p className="font-semibold text-foreground">
              {row.privilegeCount > 0
                ? `${row.privilegeCount} matrix privileges`
                : `${row.permissionCount} permissions`}
            </p>
            <p className="mt-1 text-xs text-muted">
              {row.miscPermissionCount} admin switch
              {row.miscPermissionCount === 1 ? "" : "es"}
            </p>
          </div>
        ),
        sortAccessor: (row) =>
          row.privilegeCount + row.permissionCount + row.miscPermissionCount,
      },
      {
        key: "users",
        header: "Users",
        sortable: true,
        render: (row) => row.userCount,
        sortAccessor: (row) => row.userCount,
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        filterOptions: [
          { label: "Active", value: "Active" },
          { label: "Inactive", value: "Inactive" },
        ],
        render: (row) => badge(row.statusLabel),
        filterAccessor: (row) => row.statusLabel,
      },
      {
        key: "updatedAt",
        header: "Modified",
        sortable: true,
        render: (row) => formatDate(row.updatedAt),
        sortAccessor: (row) => new Date(row.updatedAt),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <Button
              href={`${roleRouteBase}/${row.id}`}
              size="icon-sm"
              variant="ghost"
              aria-label={`View ${row.name}`}
              title={`View ${row.name}`}
              leftIcon={<Eye className="h-4 w-4" />}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Clone ${row.name}`}
              title={`Clone ${row.name}`}
              disabled={row.isCloneable === false}
              leftIcon={<Copy className="h-4 w-4" />}
              onClick={() => openRole(row, "clone")}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Edit ${row.name}`}
              title={row.isSystem ? "System roles are read-only" : `Edit ${row.name}`}
              disabled={row.isSystem || row.isEditable === false}
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => openRole(row, "edit")}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${row.name}`}
              title={
                row.isSystem
                  ? "System roles cannot be deleted"
                  : row.userCount > 0
                    ? "Remove users from this role before deleting it"
                    : `Delete ${row.name}`
              }
              disabled={row.isSystem || row.userCount > 0}
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => void deleteRole(row)}
            />
          </div>
        ),
      },
    ];

  function openRole(role: AccessRoleRecord, nextMode: RoleEditorMode) {
    setSelectedRoleId(role.id);
    setMode(nextMode);
    setMessage(null);
    setError(null);
    setEditor(
      nextMode === "clone"
        ? {
            description: role.description ?? "",
            name: `${role.name} Copy`,
            permissionIds: role.rolePermissions.map((item) => item.permission.id),
          }
        : roleToEditor(role),
    );
  }

  function createRole() {
    setMode("create");
    setSelectedRoleId("");
    setMessage(null);
    setError(null);
    setEditor({
      description: "",
      name: "",
      permissionIds: [],
    });
  }

  async function saveRole() {
    setError(null);
    setMessage(null);

    const payload = {
      description: editor.description.trim(),
      key: normalizeRoleKey(editor.name),
      name: editor.name.trim(),
      permissionIds: editor.permissionIds,
    };

    if (!payload.name) {
      setError("Role name is required.");
      return;
    }

    setSaving(true);
    try {
      const isUpdate = mode === "edit" && editor.id;
      const response = await fetch(
        isUpdate ? `/api/roles/${editor.id}` : "/api/roles",
        {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | AccessRoleRecord
        | { message?: string }
        | null;

      if (!response.ok || !data || !("id" in data)) {
        setError(
          data && "message" in data
            ? data.message || "Unable to save the role."
            : "Unable to save the role.",
        );
        return;
      }

      setRoles((current) =>
        current.some((role) => role.id === data.id)
          ? current.map((role) => (role.id === data.id ? data : role))
          : [...current, data],
      );
      setSelectedRoleId(data.id);
      setEditor(roleToEditor(data));
      setMode(data.isSystem ? "view" : "edit");
      setMessage(isUpdate ? "Role updated." : "Custom role created.");
    } catch {
      setError("Role save failed. Check that the API is running.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: AccessRoleRecord) {
    if (role.isSystem || (role.userRoles?.length ?? 0) > 0) return;
    const confirmed = window.confirm(
      "Delete this custom role? This is only allowed when the role is not assigned to any users.",
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as {
        deleted?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !data?.deleted) {
        setError(data?.message ?? "Unable to delete the role.");
        return;
      }

      setRoles((current) => current.filter((item) => item.id !== role.id));
      setSelectedRoleId("");
      setEditor({ description: "", name: "", permissionIds: [] });
      setMode("create");
      setMessage("Role deleted.");
    } catch {
      setError("Role delete failed. Check that the API is running.");
    }
  }

  function togglePermission(permissionId: string) {
    if (!canMutateSelected) return;
    setEditor((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter((id) => id !== permissionId)
        : [...current.permissionIds, permissionId],
    }));
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Roles" value={rows.length} />
          <SummaryCard
            label="Custom"
            value={rows.filter((role) => !role.isSystem).length}
          />
          <SummaryCard
            label="System"
            value={rows.filter((role) => role.isSystem).length}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={createRole}
        >
          New custom role
        </Button>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 15 }}
        searchPlaceholder="Search role name, key, or description"
        emptyState={
          <div className="p-8 text-center text-sm text-muted">
            No roles found.
          </div>
        }
      />

      <section className="grid gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              {mode === "create"
                ? "Create Custom Role"
                : mode === "clone"
                  ? "Clone Role"
                  : selectedRole?.isSystem
                    ? "System Role"
                    : "Custom Role"}
            </p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">
              {editor.name || "New role"}
            </h3>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!selectedRole || selectedRole.isSystem}
              onClick={() => selectedRole && openRole(selectedRole, "edit")}
            >
              Edit
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!canMutateSelected}
              onClick={() => void saveRole()}
            >
              Save
            </Button>
          </div>
        </div>

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                Role name
              </span>
              <input
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface"
                value={editor.name}
                disabled={!canMutateSelected}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-foreground">
                Description
              </span>
              <textarea
                className="min-h-28 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface"
                value={editor.description}
                disabled={!canMutateSelected}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <div className="rounded-lg border border-border bg-white p-3 text-sm text-muted">
              <p>Users assigned: {selectedRole?.userRoles?.length ?? 0}</p>
              <p>Selected permissions: {editor.permissionIds.length}</p>
              <p>
                Activate/deactivate is intentionally not exposed here until role
                lifecycle policy is finalized.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <input
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Search permissions by module, key, or label"
              value={permissionQuery}
              onChange={(event) => setPermissionQuery(event.target.value)}
            />
            <div className="max-h-[520px] overflow-auto rounded-lg border border-border bg-white">
              {filteredPermissionGroups.map((group) => (
                <div className="border-b border-border p-4" key={group.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    {group.label}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {group.items.map((permission) => (
                      <label
                        className="flex gap-3 rounded-lg border border-border bg-surface/50 p-3 text-sm"
                        key={permission.id}
                      >
                        <input
                          className="mt-1 h-4 w-4 accent-accent"
                          type="checkbox"
                          checked={editor.permissionIds.includes(permission.id)}
                          disabled={!canMutateSelected}
                          onChange={() => togglePermission(permission.id)}
                        />
                        <span>
                          <span className="font-semibold text-foreground">
                            {permission.name}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {permission.key}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {permission.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

function roleToEditor(role?: AccessRoleRecord | null): RoleEditorState {
  return {
    id: role?.id,
    description: role?.description ?? "",
    name: role?.name ?? "",
    permissionIds: role?.rolePermissions.map((item) => item.permission.id) ?? [],
  };
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="min-w-32 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </article>
  );
}

function badge(value: string) {
  return (
    <span className="inline-flex rounded-full border border-border bg-white px-2.5 py-1 text-xs font-semibold text-muted">
      {value}
    </span>
  );
}

function normalizeRoleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function startCase(value: string) {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
