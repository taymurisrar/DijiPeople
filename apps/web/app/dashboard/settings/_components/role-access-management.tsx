"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PermissionGate } from "../../_components/permission-gate";
import {
  AccessPermissionRecord,
  AccessRoleRecord,
  AccessUserRecord,
} from "../types";

type RoleAccessManagementProps = {
  initialPermissions: AccessPermissionRecord[];
  initialRoles: AccessRoleRecord[];
  initialUsers: AccessUserRecord[];
  mode?: "all" | "roles" | "users";
};

type RoleEditorState = {
  description: string;
  id?: string;
  name: string;
  permissionIds: string[];
};

export function RoleAccessManagement({
  initialPermissions,
  initialRoles,
  initialUsers,
  mode = "all",
}: RoleAccessManagementProps) {
  const [roles, setRoles] = useState(initialRoles);
  const [users, setUsers] = useState(initialUsers);
  const [roleEditor, setRoleEditor] = useState<RoleEditorState>({
    name: "",
    description: "",
    permissionIds: [],
  });
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [pendingUserRoleIds, setPendingUserRoleIds] = useState<
    Record<string, string[]>
  >({});
  const [pendingUserPermissionIds, setPendingUserPermissionIds] = useState<
    Record<string, string[]>
  >({});
  const [userFeedback, setUserFeedback] = useState<Record<string, string>>({});
  const [userError, setUserError] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const permissionGroups = useMemo(
    () => groupPermissions(initialPermissions),
    [initialPermissions],
  );

  function startCreateRole() {
    setRoleEditor({
      name: "",
      description: "",
      permissionIds: [],
    });
    setRoleMessage(null);
    setRoleError(null);
  }

  function startEditRole(role: AccessRoleRecord) {
    setRoleEditor({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      permissionIds: role.rolePermissions.map((item) => item.permission.id),
    });
    setRoleMessage(null);
    setRoleError(null);
  }

  async function handleSaveRole() {
    setRoleError(null);
    setRoleMessage(null);

    const payload = {
      name: roleEditor.name.trim(),
      description: roleEditor.description.trim(),
      permissionIds: roleEditor.permissionIds,
      key: normalizeRoleKey(roleEditor.name),
    };

    if (!payload.name) {
      setRoleError("Role name is required.");
      return;
    }

    setSavingRole(true);

    try {
      const response = await fetch(
        roleEditor.id ? `/api/roles/${roleEditor.id}` : "/api/roles",
        {
          method: roleEditor.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | AccessRoleRecord
        | { message?: string }
        | null;

      if (!response.ok || !data || !("id" in data)) {
        setRoleError(
          data && "message" in data
            ? data.message || "Unable to save the role."
            : "Unable to save the role.",
        );
        return;
      }

      setRoles((current) =>
        current.some((role) => role.id === data.id)
          ? current.map((role) => (role.id === data.id ? data : role))
          : [...current, data].sort((left, right) => left.name.localeCompare(right.name)),
      );
      setRoleMessage(roleEditor.id ? "Role updated." : "Role created.");
      setRoleEditor({
        id: data.id,
        name: data.name,
        description: data.description ?? "",
        permissionIds: data.rolePermissions.map((item) => item.permission.id),
      });
    } catch {
      setRoleError("Role save failed. Check that the API is running.");
    } finally {
      setSavingRole(false);
    }
  }

  async function handleDeleteRole(roleId: string) {
    setRoleError(null);
    setRoleMessage(null);

    const confirmed = window.confirm(
      "Delete this custom role? Make sure it is no longer assigned to any users.",
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/roles/${roleId}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { deleted?: boolean; message?: string }
        | null;

      if (!response.ok || !data?.deleted) {
        setRoleError(data?.message ?? "Unable to delete the role.");
        return;
      }

      setRoles((current) => current.filter((role) => role.id !== roleId));
      if (roleEditor.id === roleId) {
        startCreateRole();
      }
      setRoleMessage("Role deleted.");
    } catch {
      setRoleError("Role delete failed. Check that the API is running.");
    }
  }

  function getPendingRoleIds(user: AccessUserRecord) {
    return pendingUserRoleIds[user.userId] ?? user.roles.map((role) => role.id);
  }

  function getPendingPermissionIds(user: AccessUserRecord) {
    return pendingUserPermissionIds[user.userId] ?? user.directPermissions.map((permission) => permission.id);
  }

  async function handleSaveUserAccess(user: AccessUserRecord) {
    setUserError((current) => ({ ...current, [user.userId]: "" }));
    setUserFeedback((current) => ({ ...current, [user.userId]: "" }));
    setSavingUserId(user.userId);

    try {
      const roleIds = getPendingRoleIds(user);
      const permissionIds = getPendingPermissionIds(user);

      const [rolesResponse, permissionsResponse] = await Promise.all([
        fetch(`/api/users/${user.userId}/roles`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleIds }),
        }),
        fetch(`/api/users/${user.userId}/permissions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionIds }),
        }),
      ]);

      const rolesPayload = (await rolesResponse.json().catch(() => null)) as
        | AccessUserRecord
        | { message?: string }
        | null;
      const permissionsPayload = (await permissionsResponse
        .json()
        .catch(() => null)) as AccessUserRecord | { message?: string } | null;

      if (
        !rolesResponse.ok ||
        !permissionsResponse.ok ||
        !rolesPayload ||
        !permissionsPayload ||
        !("userId" in rolesPayload) ||
        !("userId" in permissionsPayload)
      ) {
        const message =
          (rolesPayload && "message" in rolesPayload && rolesPayload.message) ||
          (permissionsPayload &&
            "message" in permissionsPayload &&
            permissionsPayload.message) ||
          "Unable to save user access.";
        setUserError((current) => ({ ...current, [user.userId]: message }));
        return;
      }

      setUsers((current) =>
        current.map((entry) =>
          entry.userId === user.userId ? permissionsPayload : entry,
        ),
      );
      setPendingUserRoleIds((current) => ({
        ...current,
        [user.userId]: permissionsPayload.roles.map((role) => role.id),
      }));
      setPendingUserPermissionIds((current) => ({
        ...current,
        [user.userId]: permissionsPayload.directPermissions.map(
          (permission) => permission.id,
        ),
      }));
      setUserFeedback((current) => ({
        ...current,
        [user.userId]: "Access updated.",
      }));
    } catch {
      setUserError((current) => ({
        ...current,
        [user.userId]: "User access update failed. Check that the API is running.",
      }));
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleDeleteUser(user: AccessUserRecord) {
    const confirmed = window.confirm(
      `Delete ${user.firstName} ${user.lastName}? This removes their tenant account and access.`,
    );

    if (!confirmed) {
      return;
    }

    setUserError((current) => ({ ...current, [user.userId]: "" }));
    setUserFeedback((current) => ({ ...current, [user.userId]: "" }));
    setDeletingUserId(user.userId);

    try {
      const response = await fetch(`/api/users/${user.userId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | { deleted?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.deleted) {
        setUserError((current) => ({
          ...current,
          [user.userId]: payload?.message ?? "Unable to delete the user.",
        }));
        return;
      }

      setUsers((current) => current.filter((entry) => entry.userId !== user.userId));
    } catch {
      setUserError((current) => ({
        ...current,
        [user.userId]: "User delete failed. Check that the API is running.",
      }));
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <div
      className={
        mode === "all"
          ? "grid gap-6 xl:grid-cols-[0.95fr_1.05fr]"
          : "grid gap-6"
      }
    >
      {mode !== "users" ? (
      <section className="grid gap-6">
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                Roles
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">
                Tenant roles and permission bundles
              </h3>
            </div>
            <PermissionGate anyOf={["roles.create"]}>
              <button
                className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                onClick={startCreateRole}
                type="button"
              >
                New role
              </button>
            </PermissionGate>
          </div>

          <div className="mt-5 grid gap-3">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-2xl border border-border bg-white/80 px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{role.name}</p>
                      <span className="rounded-full bg-surface px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted">
                        {role.key}
                      </span>
                      {role.isSystem ? (
                        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong">
                          System
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {role.description || "No description added for this role yet."}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {role.rolePermissions.length} permissions •{" "}
                      {role.userRoles?.length ?? 0} assigned users
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="rounded-2xl border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                      href={`/dashboard/settings/access/roles/${role.id}`}
                    >
                      View
                    </Link>
                    <PermissionGate anyOf={["roles.update", "roles.assign-permissions"]}>
                      <button
                        className="rounded-2xl border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent disabled:opacity-60"
                        disabled={role.isSystem}
                        onClick={() => startEditRole(role)}
                        type="button"
                      >
                        Edit
                      </button>
                    </PermissionGate>
                    <PermissionGate anyOf={["roles.update"]}>
                      <button
                        className="rounded-2xl border border-danger/20 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/5 disabled:opacity-60"
                        disabled={role.isSystem}
                        onClick={() => handleDeleteRole(role.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </PermissionGate>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <PermissionGate anyOf={["roles.create", "roles.update", "roles.assign-permissions"]}>
          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                Role Editor
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">
                {roleEditor.id ? "Update custom role" : "Create a custom role"}
              </h3>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-foreground">Role name</span>
                <input
                  className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  onChange={(event) =>
                    setRoleEditor((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Operations coordinator"
                  value={roleEditor.name}
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-foreground">Description</span>
                <textarea
                  className="min-h-24 rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  onChange={(event) =>
                    setRoleEditor((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Explain what this role is meant to do."
                  value={roleEditor.description}
                />
              </label>
            </div>

            <div className="mt-6 grid gap-4">
              {permissionGroups.map((group) => (
                <details
                  className="rounded-2xl border border-border bg-white/80 px-4 py-4"
                  key={group.key}
                  open
                >
                  <summary className="cursor-pointer list-none font-medium text-foreground">
                    {group.label}
                    <span className="ml-2 text-sm text-muted">
                      ({group.permissions.length})
                    </span>
                  </summary>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {group.permissions.map((permission) => {
                      const checked = roleEditor.permissionIds.includes(permission.id);
                      return (
                        <label
                          className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-3 py-3 text-sm"
                          key={permission.id}
                        >
                          <input
                            checked={checked}
                            onChange={() =>
                              setRoleEditor((current) => ({
                                ...current,
                                permissionIds: checked
                                  ? current.permissionIds.filter((id) => id !== permission.id)
                                  : [...current.permissionIds, permission.id],
                              }))
                            }
                            type="checkbox"
                          />
                          <span>
                            <span className="block font-medium text-foreground">
                              {permission.name}
                            </span>
                            <span className="mt-1 block text-muted">
                              {permission.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>

            {roleError ? (
              <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                {roleError}
              </p>
            ) : null}
            {roleMessage ? (
              <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {roleMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
                disabled={savingRole}
                onClick={handleSaveRole}
                type="button"
              >
                {savingRole ? "Saving..." : roleEditor.id ? "Save role" : "Create role"}
              </button>
              <button
                className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                onClick={startCreateRole}
                type="button"
              >
                Clear
              </button>
            </div>
          </article>
        </PermissionGate>
      </section>
      ) : null}

      {mode !== "roles" ? (
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            User Access
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Expand users to manage roles and direct access
          </h3>
          <p className="mt-2 text-sm text-muted">
            Role-based access stays primary. Direct permissions are available for
            targeted exceptions where needed.
          </p>
        </div>

        <div className="mt-5 grid gap-3">
          {users.map((user) => {
            const expanded = expandedUserId === user.userId;
            const pendingRoleIds = getPendingRoleIds(user);
            const pendingPermissionIds = getPendingPermissionIds(user);
            const ownerProtected = user.ownership.isTenantOwner;

            return (
              <article
                className="rounded-2xl border border-border bg-white/80 px-4 py-4"
                key={user.userId}
              >
                <button
                  className="flex w-full items-start justify-between gap-4 text-left"
                  onClick={() =>
                    setExpandedUserId((current) =>
                      current === user.userId ? null : user.userId,
                    )
                  }
                  type="button"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="mt-1 text-sm text-muted">{user.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
                        {formatOwnershipLabel(user.ownership.designation)}
                      </span>
                      {user.isServiceAccount ? (
                        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
                          Service Account
                        </span>
                      ) : null}
                      {user.roles.map((role) => (
                        <span
                          className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted"
                          key={role.id}
                        >
                          {role.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted">
                    {expanded ? "Collapse" : "Expand"}
                  </span>
                </button>

                {expanded ? (
                  <div className="mt-5 grid gap-5 border-t border-border pt-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <section className="grid gap-3">
                        <h4 className="font-medium text-foreground">Assigned roles</h4>
                        {roles.map((role) => (
                          <label
                            className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-3 py-3 text-sm"
                            key={role.id}
                          >
                              <input
                                checked={pendingRoleIds.includes(role.id)}
                                disabled={ownerProtected}
                                onChange={() =>
                                  setPendingUserRoleIds((current) => ({
                                    ...current,
                                  [user.userId]: pendingRoleIds.includes(role.id)
                                    ? pendingRoleIds.filter((id) => id !== role.id)
                                    : [...pendingRoleIds, role.id],
                                }))
                              }
                              type="checkbox"
                            />
                            <span>
                              <span className="block font-medium text-foreground">
                                {role.name}
                              </span>
                              <span className="mt-1 block text-muted">
                                {role.description || role.key}
                              </span>
                            </span>
                          </label>
                        ))}
                      </section>

                      <section className="grid gap-3">
                        <h4 className="font-medium text-foreground">
                          Direct permissions
                        </h4>
                        {permissionGroups.map((group) => (
                          <details
                            className="rounded-2xl border border-border bg-surface px-3 py-3"
                            key={`${user.userId}-${group.key}`}
                          >
                            <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                              {group.label}
                            </summary>
                            <div className="mt-3 grid gap-2">
                              {group.permissions.map((permission) => (
                                <label
                                  className="flex items-start gap-3 rounded-2xl border border-border bg-white px-3 py-3 text-sm"
                                  key={permission.id}
                                >
                              <input
                                checked={pendingPermissionIds.includes(permission.id)}
                                disabled={ownerProtected}
                                onChange={() =>
                                  setPendingUserPermissionIds((current) => ({
                                    ...current,
                                        [user.userId]: pendingPermissionIds.includes(
                                          permission.id,
                                        )
                                          ? pendingPermissionIds.filter(
                                            (id) => id !== permission.id,
                                          )
                                          : [...pendingPermissionIds, permission.id],
                                      }))
                                    }
                                    type="checkbox"
                                  />
                                  <span>
                                    <span className="block font-medium text-foreground">
                                      {permission.name}
                                    </span>
                                    <span className="mt-1 block text-muted">
                                      {permission.description}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </details>
                        ))}
                      </section>
                    </div>

                    <section className="rounded-2xl border border-border bg-surface px-4 py-4">
                      <p className="text-sm font-medium text-foreground">
                        Effective permission summary
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

                    {userError[user.userId] ? (
                      <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                        {userError[user.userId]}
                      </p>
                    ) : null}
                    {userFeedback[user.userId] ? (
                      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        {userFeedback[user.userId]}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      <PermissionGate anyOf={["users.assign-roles", "users.update"]}>
                        <button
                          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
                          disabled={
                            savingUserId === user.userId || deletingUserId === user.userId
                            || ownerProtected
                          }
                          onClick={() => handleSaveUserAccess(user)}
                          type="button"
                        >
                          {savingUserId === user.userId ? "Saving..." : "Save access"}
                        </button>
                      </PermissionGate>
                      <PermissionGate anyOf={["users.delete"]}>
                        <button
                          className="rounded-2xl border border-danger/20 px-5 py-3 text-sm font-medium text-danger transition hover:bg-danger/5 disabled:opacity-60"
                          disabled={
                            deletingUserId === user.userId ||
                            user.ownership.isTenantOwner
                          }
                          onClick={() => handleDeleteUser(user)}
                          type="button"
                        >
                          {deletingUserId === user.userId ? "Deleting..." : "Delete user"}
                        </button>
                      </PermissionGate>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      ) : null}
    </div>
  );
}

function groupPermissions(permissions: AccessPermissionRecord[]) {
  const grouped = new Map<string, AccessPermissionRecord[]>();

  permissions.forEach((permission) => {
    const groupKey = permission.key.split(".")[0] || "general";
    const currentGroup = grouped.get(groupKey) ?? [];
    currentGroup.push(permission);
    grouped.set(groupKey, currentGroup);
  });

  return Array.from(grouped.entries())
    .map(([key, items]) => ({
      key,
      label: startCase(key),
      permissions: [...items].sort((left, right) => left.key.localeCompare(right.key)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function startCase(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeRoleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatOwnershipLabel(value: AccessUserRecord["ownership"]["designation"]) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
