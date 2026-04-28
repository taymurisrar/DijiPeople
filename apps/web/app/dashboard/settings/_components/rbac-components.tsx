"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AccessRoleRecord,
  AccessUserRecord,
  RoleMatrixCatalog,
  SecurityAccessLevel,
  SecurityPrivilege,
} from "../types";

const ACCESS_LEVELS: SecurityAccessLevel[] = [
  "NONE",
  "USER",
  "BUSINESS_UNIT",
  "PARENT_CHILD_BUSINESS_UNITS",
  "ORGANIZATION",
  "TENANT",
];

const ACCESS_LABELS: Record<SecurityAccessLevel, string> = {
  NONE: "None",
  USER: "User",
  BUSINESS_UNIT: "Business Unit",
  PARENT_CHILD_BUSINESS_UNITS: "Parent + Child BUs",
  ORGANIZATION: "Organization",
  TENANT: "Tenant",
};

const ACCESS_STYLES: Record<SecurityAccessLevel, string> = {
  NONE: "bg-surface text-muted",
  USER: "bg-sky-50 text-sky-700",
  BUSINESS_UNIT: "bg-indigo-50 text-indigo-700",
  PARENT_CHILD_BUSINESS_UNITS: "bg-violet-50 text-violet-700",
  ORGANIZATION: "bg-amber-50 text-amber-800",
  TENANT: "bg-emerald-50 text-emerald-800",
};

type MatrixItem = {
  entityKey: string;
  privilege: SecurityPrivilege;
  accessLevel: SecurityAccessLevel;
};

type MiscItem = {
  permissionKey: string;
  enabled: boolean;
};

export function RoleTypeBadge({ role }: { role: AccessRoleRecord }) {
  const isSystem = role.roleType === "SYSTEM" || role.isSystem;

  return (
    <span
      className={
        isSystem
          ? "rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong"
          : "rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted"
      }
    >
      {isSystem ? "System" : "Custom"}
    </span>
  );
}

export function AccessLevelSelector({
  disabled,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: SecurityAccessLevel;
  onChange: (value: SecurityAccessLevel) => void;
}) {
  return (
    <select
      aria-label="Access level"
      className="w-full min-w-36 rounded-lg border border-border bg-white px-2 py-2 text-xs text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
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
  );
}

export function PrivilegeCell({
  disabled,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: SecurityAccessLevel;
  onChange: (value: SecurityAccessLevel) => void;
}) {
  return (
    <div className={`rounded-lg px-1 py-1 ${ACCESS_STYLES[value]}`}>
      <AccessLevelSelector disabled={disabled} onChange={onChange} value={value} />
    </div>
  );
}

export function PermissionGroupAccordion({
  children,
  count,
  title,
}: {
  children: ReactNode;
  count: number;
  title: string;
}) {
  return (
    <details className="rounded-2xl border border-border bg-white/80" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="font-medium text-foreground">{title}</span>
        <span className="rounded-full bg-surface px-3 py-1 text-xs text-muted">
          {count}
        </span>
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
  );
}

export function PermissionMatrix({
  catalog,
  disabled,
  initialPrivileges,
  onSave,
}: {
  catalog: RoleMatrixCatalog;
  disabled?: boolean;
  initialPrivileges: MatrixItem[];
  onSave?: (items: MatrixItem[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(() =>
    hydrateMatrix(catalog, initialPrivileges),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const grouped = new Map<string, typeof catalog.entities>();
    const normalizedQuery = query.trim().toLowerCase();

    for (const entity of catalog.entities) {
      if (
        normalizedQuery &&
        !entity.label.toLowerCase().includes(normalizedQuery) &&
        !entity.key.toLowerCase().includes(normalizedQuery)
      ) {
        continue;
      }

      const current = grouped.get(entity.category) ?? [];
      current.push(entity);
      grouped.set(entity.category, current);
    }

    return Array.from(grouped.entries());
  }, [catalog.entities, query]);

  function setCell(
    entityKey: string,
    privilege: SecurityPrivilege,
    accessLevel: SecurityAccessLevel,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.entityKey === entityKey && item.privilege === privilege
          ? { ...item, accessLevel }
          : item,
      ),
    );
  }

  function setRow(entityKey: string, accessLevel: SecurityAccessLevel) {
    setItems((current) =>
      current.map((item) =>
        item.entityKey === entityKey ? { ...item, accessLevel } : item,
      ),
    );
  }

  async function save() {
    if (!onSave) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await onSave(items);
      setMessage("Permission matrix saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save permission matrix.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className="min-w-64 rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search modules"
          value={query}
        />
        {onSave ? (
          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
            disabled={disabled || saving}
            onClick={save}
            type="button"
          >
            {saving ? "Saving..." : "Save matrix"}
          </button>
        ) : null}
      </div>

      <div className="grid gap-3">
        {groups.map(([category, entities]) => (
          <PermissionGroupAccordion
            count={entities.length}
            key={category}
            title={category}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-sm">
                <thead>
                  <tr className="bg-surface text-left text-xs uppercase tracking-[0.12em] text-muted">
                    <th className="sticky left-0 z-10 bg-surface px-3 py-3">
                      Module
                    </th>
                    <th className="px-3 py-3">Row</th>
                    {catalog.privileges.map((privilege) => (
                      <th className="px-3 py-3" key={privilege}>
                        {startCase(privilege)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entities.map((entity) => (
                    <tr className="border-t border-border" key={entity.key}>
                      <th className="sticky left-0 z-10 bg-white px-3 py-3 text-left font-medium text-foreground">
                        {entity.label}
                      </th>
                      <td className="px-3 py-3">
                        <AccessLevelSelector
                          disabled={disabled}
                          onChange={(level) => setRow(entity.key, level)}
                          value="NONE"
                        />
                      </td>
                      {catalog.privileges.map((privilege) => {
                        const value =
                          items.find(
                            (item) =>
                              item.entityKey === entity.key &&
                              item.privilege === privilege,
                          )?.accessLevel ?? "NONE";

                        return (
                          <td className="px-2 py-2" key={privilege}>
                            <PrivilegeCell
                              disabled={disabled}
                              onChange={(level) =>
                                setCell(entity.key, privilege, level)
                              }
                              value={value}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PermissionGroupAccordion>
        ))}
      </div>

      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function MiscPermissionPanel({
  catalog,
  disabled,
  initialPermissions,
  onSave,
}: {
  catalog: RoleMatrixCatalog;
  disabled?: boolean;
  initialPermissions: MiscItem[];
  onSave?: (items: MiscItem[]) => Promise<void>;
}) {
  const [items, setItems] = useState(() =>
    catalog.miscPermissions.map((permission) => ({
      permissionKey: permission.key,
      enabled:
        initialPermissions.find((item) => item.permissionKey === permission.key)
          ?.enabled ?? false,
    })),
  );

  const groups = useMemo(() => {
    const grouped = new Map<string, typeof catalog.miscPermissions>();
    for (const permission of catalog.miscPermissions) {
      const current = grouped.get(permission.category) ?? [];
      current.push(permission);
      grouped.set(permission.category, current);
    }
    return Array.from(grouped.entries());
  }, [catalog.miscPermissions]);

  return (
    <section className="grid gap-3">
      {groups.map(([category, permissions]) => (
        <div
          className="rounded-2xl border border-border bg-white/80 px-4 py-4"
          key={category}
        >
          <h4 className="font-medium text-foreground">{category}</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {permissions.map((permission) => {
              const checked =
                items.find((item) => item.permissionKey === permission.key)
                  ?.enabled ?? false;

              return (
                <label
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-3 py-3 text-sm"
                  key={permission.key}
                >
                  <input
                    checked={checked}
                    disabled={disabled}
                    onChange={() =>
                      setItems((current) =>
                        current.map((item) =>
                          item.permissionKey === permission.key
                            ? { ...item, enabled: !item.enabled }
                            : item,
                        ),
                      )
                    }
                    type="checkbox"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      {permission.label}
                    </span>
                    <span className="mt-1 block text-muted">
                      {permission.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {onSave ? (
        <button
          className="w-fit rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent disabled:opacity-60"
          disabled={disabled}
          onClick={() => onSave(items)}
          type="button"
        >
          Save miscellaneous permissions
        </button>
      ) : null}
    </section>
  );
}

export function AssignedUsersPanel({ users }: { users: AccessUserRecord[] }) {
  return (
    <section className="grid gap-3">
      {users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-4 text-sm text-muted">
          No users are currently assigned to this role.
        </div>
      ) : (
        users.map((user) => (
          <div
            className="rounded-2xl border border-border bg-white/80 px-4 py-4"
            key={user.userId}
          >
            <p className="font-medium text-foreground">
              {user.firstName} {user.lastName}
            </p>
            <p className="mt-1 text-sm text-muted">{user.email}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">
              {user.businessUnit?.organizationName ?? "No organization"} /{" "}
              {user.businessUnit?.name ?? "No business unit"}
            </p>
          </div>
        ))
      )}
    </section>
  );
}

export function EffectiveAccessViewer({ user }: { user: AccessUserRecord }) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-4 py-4">
      <p className="text-sm font-medium text-foreground">
        Effective access summary
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {user.effectivePermissionKeys.map((permissionKey) => (
          <span
            className="rounded-full bg-white px-3 py-1 text-xs text-muted"
            key={permissionKey}
          >
            {permissionKey}
          </span>
        ))}
      </div>
    </section>
  );
}

export function UserAccessCard({ user }: { user: AccessUserRecord }) {
  return (
    <article className="rounded-2xl border border-border bg-white/80 px-4 py-4">
      <p className="font-semibold text-foreground">
        {user.firstName} {user.lastName}
      </p>
      <p className="mt-1 text-sm text-muted">{user.email}</p>
      <p className="mt-1 text-sm text-muted">
        {user.businessUnit?.organizationName ?? "No organization"} /{" "}
        {user.businessUnit?.name ?? "No business unit"}
      </p>
    </article>
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

function startCase(value: string) {
  return value
    .toLowerCase()
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
