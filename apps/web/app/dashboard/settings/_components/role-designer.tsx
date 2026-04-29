"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AccessRoleRecord,
  AccessUserRecord,
  RoleMatrixCatalog,
  SecurityAccessLevel,
  SecurityPrivilege,
} from "../types";
import { AssignedUsersPanel, RoleTypeBadge } from "./rbac-components";

type MatrixItem = {
  entityKey: string;
  privilege: SecurityPrivilege;
  accessLevel: SecurityAccessLevel;
};

type MiscItem = {
  permissionKey: string;
  enabled: boolean;
};

const ACCESS_LEVELS: SecurityAccessLevel[] = [
  "NONE",
  "SELF",
  "TEAM",
  "BUSINESS_UNIT",
  "PARENT_CHILD_BUSINESS_UNIT",
  "ORGANIZATION",
  "TENANT",
];

const ACCESS_LABELS: Record<SecurityAccessLevel, string> = {
  NONE: "None",
  SELF: "Self",
  TEAM: "Team",
  USER: "Self",
  BUSINESS_UNIT: "Business Unit",
  PARENT_CHILD_BUSINESS_UNIT: "Parent & Child BUs",
  PARENT_CHILD_BUSINESS_UNITS: "Parent & Child BUs",
  ORGANIZATION: "Organization",
  TENANT: "Tenant",
};

const ACCESS_STYLES: Record<SecurityAccessLevel, string> = {
  NONE: "border-border bg-surface text-muted",
  SELF: "border-sky-200 bg-sky-50 text-sky-700",
  TEAM: "border-cyan-200 bg-cyan-50 text-cyan-700",
  USER: "border-sky-200 bg-sky-50 text-sky-700",
  BUSINESS_UNIT: "border-indigo-200 bg-indigo-50 text-indigo-700",
  PARENT_CHILD_BUSINESS_UNIT: "border-violet-200 bg-violet-50 text-violet-700",
  PARENT_CHILD_BUSINESS_UNITS: "border-violet-200 bg-violet-50 text-violet-700",
  ORGANIZATION: "border-amber-200 bg-amber-50 text-amber-800",
  TENANT: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function RoleDesignerPage({
  assignedUsers,
  initialRole,
  matrixCatalog,
  roles,
}: {
  assignedUsers: AccessUserRecord[];
  initialRole: AccessRoleRecord;
  matrixCatalog: RoleMatrixCatalog;
  roles: AccessRoleRecord[];
}) {
  const [role, setRole] = useState(initialRole);
  const [draftPrivileges, setDraftPrivileges] = useState(() =>
    hydrateMatrix(matrixCatalog, initialRole.rolePrivileges ?? []),
  );
  const [draftMiscPermissions, setDraftMiscPermissions] = useState(() =>
    hydrateMiscPermissions(matrixCatalog, initialRole.miscPermissions ?? []),
  );
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(matrixCatalog.entities.map((entity) => entity.category)),
  );
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const locked = role.isSystem || role.isEditable === false;
  const filteredGroups = useMemo(
    () => groupEntities(matrixCatalog, query),
    [matrixCatalog, query],
  );
  const activePrivilegeCount = draftPrivileges.filter(
    (item) => item.accessLevel !== "NONE",
  ).length;

  function updateCell(
    entityKey: string,
    privilege: SecurityPrivilege,
    accessLevel: SecurityAccessLevel,
  ) {
    setDraftPrivileges((current) =>
      current.map((item) =>
        item.entityKey === entityKey && item.privilege === privilege
          ? { ...item, accessLevel }
          : item,
      ),
    );
    setIsDirty(true);
  }

  function updateRow(entityKey: string, accessLevel: SecurityAccessLevel) {
    setDraftPrivileges((current) =>
      current.map((item) =>
        item.entityKey === entityKey ? { ...item, accessLevel } : item,
      ),
    );
    setIsDirty(true);
  }

  function toggleGroup(category: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function setAllGroups(expanded: boolean) {
    setExpandedGroups(
      expanded
        ? new Set(matrixCatalog.entities.map((entity) => entity.category))
        : new Set(),
    );
  }

  function applyRoleSnapshot(nextRole: AccessRoleRecord) {
    setRole(nextRole);
    setDraftPrivileges(hydrateMatrix(matrixCatalog, nextRole.rolePrivileges ?? []));
    setDraftMiscPermissions(
      hydrateMiscPermissions(matrixCatalog, nextRole.miscPermissions ?? []),
    );
    setIsDirty(false);
  }

  async function saveMatrix() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/roles/${role.id}/matrix`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privileges: draftPrivileges,
          miscPermissions: draftMiscPermissions,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | AccessRoleRecord
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          payload && "message" in payload
            ? payload.message ?? "Unable to save role permissions."
            : "Unable to save role permissions.",
        );
      }

      applyRoleSnapshot(payload);
      setMessage("Role permissions saved.");
      setIsConfirmOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save role permissions.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function resetDefault() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/roles/${role.id}/reset-default`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | AccessRoleRecord
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("id" in payload)) {
        throw new Error(
          payload && "message" in payload
            ? payload.message ?? "Unable to reset system role."
            : "Unable to reset system role.",
        );
      }

      applyRoleSnapshot(payload);
      setMessage("System role defaults restored.");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset system role.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function copyFromRole(sourceRoleId: string) {
    const sourceRole =
      roles.find((candidate) => candidate.id === sourceRoleId) ??
      (await fetch(`/api/roles/${sourceRoleId}`).then((response) =>
        response.json(),
      )) as AccessRoleRecord;

    setDraftPrivileges(
      hydrateMatrix(matrixCatalog, sourceRole.rolePrivileges ?? []),
    );
    setDraftMiscPermissions(
      hydrateMiscPermissions(matrixCatalog, sourceRole.miscPermissions ?? []),
    );
    setIsDirty(true);
    setIsCopyOpen(false);
    setMessage(`Copied permissions from ${sourceRole.name}. Review and save to apply.`);
  }

  return (
    <section className="grid gap-6">
      <RoleHeaderCard
        activePrivilegeCount={activePrivilegeCount}
        assignedUserCount={assignedUsers.length}
        locked={locked}
        role={role}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid gap-4">
          <div className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted">
                  Permission Matrix
                </p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">
                  Entity access by action and scope
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  onClick={() => setAllGroups(true)}
                  type="button"
                >
                  Expand all
                </button>
                <button
                  className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  onClick={() => setAllGroups(false)}
                  type="button"
                >
                  Collapse all
                </button>
                <button
                  className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  onClick={() => setIsCopyOpen(true)}
                  type="button"
                >
                  Copy from role
                </button>
                {role.isSystem ? (
                  <button
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-300"
                    disabled={isSaving}
                    onClick={resetDefault}
                    type="button"
                  >
                    Reset default
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                className="min-w-72 rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search modules, entities, or groups"
                value={query}
              />
              {locked ? (
                <span className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Locked system role. Clone it for custom edits.
                </span>
              ) : null}
            </div>
          </div>

          <PermissionMatrix
            catalog={matrixCatalog}
            disabled={locked}
            expandedGroups={expandedGroups}
            groups={filteredGroups}
            privileges={draftPrivileges}
            onCellChange={updateCell}
            onGroupToggle={toggleGroup}
            onRowChange={updateRow}
          />
        </section>

        <aside className="grid h-fit gap-4">
          <PermissionLegend />
          <MiscPermissionPanel
            catalog={matrixCatalog}
            disabled={locked}
            permissions={draftMiscPermissions}
            onChange={(permissionKey, enabled) => {
              setDraftMiscPermissions((current) =>
                current.map((item) =>
                  item.permissionKey === permissionKey ? { ...item, enabled } : item,
                ),
              );
              setIsDirty(true);
            }}
          />
          <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted">
                  Assigned Users
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {assignedUsers.length} assigned
                </h3>
              </div>
              <Link
                className="text-sm font-medium text-accent hover:text-accent-strong"
                href="/dashboard/settings/access/users"
              >
                Manage
              </Link>
            </div>
            <AssignedUsersPanel users={assignedUsers} />
          </section>
        </aside>
      </div>

      <UnsavedChangesBar
        disabled={locked || isSaving}
        isDirty={isDirty}
        isSaving={isSaving}
        message={message}
        error={error}
        onSave={() => setIsConfirmOpen(true)}
      />

      <RoleCopyDialog
        currentRoleId={role.id}
        isOpen={isCopyOpen}
        roles={roles}
        onClose={() => setIsCopyOpen(false)}
        onCopy={copyFromRole}
      />

      <ConfirmDialog
        body="This will update the backend role matrix and immediately affect users assigned to this role."
        confirmLabel={isSaving ? "Saving..." : "Save permissions"}
        isOpen={isConfirmOpen}
        title="Save role permission changes?"
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={saveMatrix}
      />
    </section>
  );
}

function RoleHeaderCard({
  activePrivilegeCount,
  assignedUserCount,
  locked,
  role,
}: {
  activePrivilegeCount: number;
  assignedUserCount: number;
  locked: boolean;
  role: AccessRoleRecord;
}) {
  return (
    <article className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,248,255,0.88))] p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Role Designer
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold text-foreground">{role.name}</h2>
            <RoleTypeBadge role={role} />
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                role.isActive === false
                  ? "bg-surface text-muted"
                  : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {role.isActive === false ? "Inactive" : "Active"}
            </span>
            {locked ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                Protected
              </span>
            ) : null}
          </div>
          <p className="mt-3 max-w-3xl text-sm text-muted">
            {role.description || "No description has been added for this role yet."}
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[360px]">
          <HeaderMetric label="Role key" value={role.key} />
          <HeaderMetric label="Tenant scope" value="Current tenant" />
          <HeaderMetric label="Assigned users" value={`${assignedUserCount}`} />
          <HeaderMetric label="Enabled privileges" value={`${activePrivilegeCount}`} />
        </div>
      </div>
    </article>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white/80 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function PermissionMatrix({
  catalog,
  disabled,
  expandedGroups,
  groups,
  privileges,
  onCellChange,
  onGroupToggle,
  onRowChange,
}: {
  catalog: RoleMatrixCatalog;
  disabled?: boolean;
  expandedGroups: Set<string>;
  groups: Array<[string, RoleMatrixCatalog["entities"]]>;
  privileges: MatrixItem[];
  onCellChange: (
    entityKey: string,
    privilege: SecurityPrivilege,
    accessLevel: SecurityAccessLevel,
  ) => void;
  onGroupToggle: (category: string) => void;
  onRowChange: (entityKey: string, accessLevel: SecurityAccessLevel) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted">
        No modules match your search.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map(([category, entities]) => (
        <PermissionMatrixGroup
          catalog={catalog}
          disabled={disabled}
          entities={entities}
          isOpen={expandedGroups.has(category)}
          key={category}
          privileges={privileges}
          title={category}
          onCellChange={onCellChange}
          onRowChange={onRowChange}
          onToggle={() => onGroupToggle(category)}
        />
      ))}
    </div>
  );
}

export function PermissionMatrixGroup({
  catalog,
  disabled,
  entities,
  isOpen,
  privileges,
  title,
  onCellChange,
  onRowChange,
  onToggle,
}: {
  catalog: RoleMatrixCatalog;
  disabled?: boolean;
  entities: RoleMatrixCatalog["entities"];
  isOpen: boolean;
  privileges: MatrixItem[];
  title: string;
  onCellChange: (
    entityKey: string,
    privilege: SecurityPrivilege,
    accessLevel: SecurityAccessLevel,
  ) => void;
  onRowChange: (entityKey: string, accessLevel: SecurityAccessLevel) => void;
  onToggle: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
      <button
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        onClick={onToggle}
        type="button"
      >
        <span>
          <span className="block text-lg font-semibold text-foreground">{title}</span>
          <span className="mt-1 block text-sm text-muted">
            {entities.length} module{entities.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted">
          {isOpen ? "Collapse" : "Expand"}
        </span>
      </button>
      {isOpen ? (
        <div className="border-t border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface-strong text-left text-xs uppercase tracking-[0.12em] text-muted">
                  <th className="sticky left-0 z-10 w-56 bg-surface-strong px-4 py-3">
                    Module
                  </th>
                  <th className="w-44 px-3 py-3">Set row</th>
                  {catalog.privileges.map((privilege) => (
                    <PermissionActionHeader key={privilege} privilege={privilege} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {entities.map((entity) => (
                  <tr key={entity.key}>
                    <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left">
                      <span className="block font-semibold text-foreground">
                        {entity.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {entity.key}
                      </span>
                    </th>
                    <td className="px-3 py-3 align-top">
                      <PermissionScopeSelect
                        disabled={disabled}
                        value={resolveRowScope(entity.key, privileges)}
                        onChange={(level) => onRowChange(entity.key, level)}
                      />
                    </td>
                    {catalog.privileges.map((privilege) => {
                      const value = findAccessLevel(entity.key, privilege, privileges);

                      return (
                        <td className="px-2 py-3 align-top" key={privilege}>
                          <PermissionScopeSelect
                            compact
                            disabled={disabled}
                            value={value}
                            onChange={(level) =>
                              onCellChange(entity.key, privilege, level)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function PermissionActionHeader({
  privilege,
}: {
  privilege: SecurityPrivilege;
}) {
  return (
    <th className="min-w-28 px-3 py-3">
      <span className="block whitespace-nowrap">{formatPrivilege(privilege)}</span>
    </th>
  );
}

export function PermissionScopeSelect({
  compact,
  disabled,
  value,
  onChange,
}: {
  compact?: boolean;
  disabled?: boolean;
  value: SecurityAccessLevel;
  onChange: (value: SecurityAccessLevel) => void;
}) {
  return (
    <label
      className={`block rounded-xl border px-2 py-1 ${ACCESS_STYLES[value]} ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span className="sr-only">Access scope</span>
      <select
        className={`w-full bg-transparent text-xs font-semibold outline-none ${
          compact ? "min-w-24" : "min-w-36"
        }`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as SecurityAccessLevel)}
        value={value}
      >
        {ACCESS_LEVELS.map((level) => (
          <option key={level} value={level}>
            {ACCESS_LABELS[level]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MiscPermissionPanel({
  catalog,
  disabled,
  permissions,
  onChange,
}: {
  catalog: RoleMatrixCatalog;
  disabled?: boolean;
  permissions: MiscItem[];
  onChange: (permissionKey: string, enabled: boolean) => void;
}) {
  const groups = groupMiscPermissions(catalog);

  return (
    <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Miscellaneous
      </p>
      <h3 className="mt-1 text-lg font-semibold text-foreground">
        Administrative switches
      </h3>
      <div className="mt-4 grid gap-4">
        {groups.map(([category, items]) => (
          <div className="grid gap-2" key={category}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {category}
            </p>
            {items.map((permission) => {
              const enabled =
                permissions.find((item) => item.permissionKey === permission.key)
                  ?.enabled ?? false;

              return (
                <label
                  className="flex items-start gap-3 rounded-2xl border border-border bg-white px-3 py-3"
                  key={permission.key}
                >
                  <input
                    checked={enabled}
                    className="mt-1"
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(permission.key, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {permission.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      {permission.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export function PermissionLegend() {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">Legend</p>
      <div className="mt-4 grid gap-2">
        {ACCESS_LEVELS.map((level) => (
          <div
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${ACCESS_STYLES[level]}`}
            key={level}
          >
            {ACCESS_LABELS[level]}
          </div>
        ))}
      </div>
    </section>
  );
}

export function UnsavedChangesBar({
  disabled,
  error,
  isDirty,
  isSaving,
  message,
  onSave,
}: {
  disabled?: boolean;
  error: string | null;
  isDirty: boolean;
  isSaving: boolean;
  message: string | null;
  onSave: () => void;
}) {
  if (!isDirty && !message && !error) {
    return null;
  }

  return (
    <div className="sticky bottom-4 z-30 rounded-[24px] border border-border bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">
            {isDirty ? "Unsaved role permission changes" : "Role designer"}
          </p>
          {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
          {message && !error ? (
            <p className="mt-1 text-sm text-emerald-800">{message}</p>
          ) : null}
        </div>
        {isDirty ? (
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
            disabled={disabled}
            onClick={onSave}
            type="button"
          >
            {isSaving ? "Saving..." : "Review and save"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RoleCopyDialog({
  currentRoleId,
  isOpen,
  roles,
  onClose,
  onCopy,
}: {
  currentRoleId: string;
  isOpen: boolean;
  roles: AccessRoleRecord[];
  onClose: () => void;
  onCopy: (roleId: string) => void;
}) {
  const [query, setQuery] = useState("");

  if (!isOpen) {
    return null;
  }

  const filteredRoles = roles.filter((role) => {
    const normalizedQuery = query.trim().toLowerCase();
    return (
      role.id !== currentRoleId &&
      (!normalizedQuery ||
        role.name.toLowerCase().includes(normalizedQuery) ||
        role.key.toLowerCase().includes(normalizedQuery))
    );
  });

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
      <section className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-[28px] border border-border bg-surface shadow-2xl">
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                Copy Permissions
              </p>
              <h3 className="mt-1 text-2xl font-semibold text-foreground">
                Choose a source role
              </h3>
            </div>
            <button
              className="rounded-full border border-border bg-white px-3 py-1 text-sm text-muted"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
          <input
            className="mt-4 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search roles"
            value={query}
          />
        </div>
        <div className="grid max-h-[52vh] gap-3 overflow-y-auto p-5">
          {filteredRoles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-4 text-sm text-muted">
              No roles match your search.
            </div>
          ) : (
            filteredRoles.map((role) => (
              <button
                className="rounded-2xl border border-border bg-white px-4 py-4 text-left transition hover:border-accent/40 hover:bg-accent-soft"
                key={role.id}
                onClick={() => onCopy(role.id)}
                type="button"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{role.name}</span>
                  <RoleTypeBadge role={role} />
                </span>
                <span className="mt-2 block text-sm text-muted">
                  {role.description || role.key}
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ConfirmDialog({
  body,
  confirmLabel,
  isOpen,
  title,
  onClose,
  onConfirm,
}: {
  body: string;
  confirmLabel: string;
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section className="w-full max-w-md rounded-[28px] border border-border bg-surface p-6 shadow-2xl">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-foreground"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white"
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function hydrateMatrix(
  catalog: RoleMatrixCatalog,
  initialPrivileges: MatrixItem[],
) {
  return catalog.entities.flatMap((entity) =>
    catalog.privileges.map((privilege) => ({
      entityKey: entity.key,
      privilege,
      accessLevel:
        initialPrivileges.find(
          (item) =>
            item.entityKey === entity.key && item.privilege === privilege,
        )?.accessLevel ?? "NONE",
    })),
  );
}

function hydrateMiscPermissions(
  catalog: RoleMatrixCatalog,
  initialPermissions: MiscItem[],
) {
  return catalog.miscPermissions.map((permission) => ({
    permissionKey: permission.key,
    enabled:
      initialPermissions.find((item) => item.permissionKey === permission.key)
        ?.enabled ?? false,
  }));
}

function groupEntities(catalog: RoleMatrixCatalog, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const grouped = new Map<string, RoleMatrixCatalog["entities"]>();

  for (const entity of catalog.entities) {
    if (
      normalizedQuery &&
      !entity.label.toLowerCase().includes(normalizedQuery) &&
      !entity.key.toLowerCase().includes(normalizedQuery) &&
      !entity.category.toLowerCase().includes(normalizedQuery)
    ) {
      continue;
    }

    const current = grouped.get(entity.category) ?? [];
    current.push(entity);
    grouped.set(entity.category, current);
  }

  return Array.from(grouped.entries());
}

function groupMiscPermissions(catalog: RoleMatrixCatalog) {
  const grouped = new Map<string, RoleMatrixCatalog["miscPermissions"]>();
  for (const permission of catalog.miscPermissions) {
    const current = grouped.get(permission.category) ?? [];
    current.push(permission);
    grouped.set(permission.category, current);
  }
  return Array.from(grouped.entries());
}

function findAccessLevel(
  entityKey: string,
  privilege: SecurityPrivilege,
  privileges: MatrixItem[],
) {
  return (
    privileges.find(
      (item) => item.entityKey === entityKey && item.privilege === privilege,
    )?.accessLevel ?? "NONE"
  );
}

function resolveRowScope(entityKey: string, privileges: MatrixItem[]) {
  const rowItems = privileges.filter((item) => item.entityKey === entityKey);
  const activeItems = rowItems.filter((item) => item.accessLevel !== "NONE");

  if (activeItems.length === 0) {
    return "NONE";
  }

  const firstLevel = activeItems[0]?.accessLevel ?? "NONE";
  return activeItems.every((item) => item.accessLevel === firstLevel)
    ? firstLevel
    : "NONE";
}

function formatPrivilege(value: SecurityPrivilege) {
  if (value === "APPEND_TO") {
    return "Append To";
  }
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
