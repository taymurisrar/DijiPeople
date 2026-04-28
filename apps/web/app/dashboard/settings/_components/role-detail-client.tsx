"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AccessRoleRecord,
  AccessUserRecord,
  RoleMatrixCatalog,
} from "../types";
import {
  AssignedUsersPanel,
  MiscPermissionPanel,
  PermissionMatrix,
  RoleTypeBadge,
} from "./rbac-components";

export function RoleDetailClient({
  initialRole,
  assignedUsers,
  matrixCatalog,
}: {
  initialRole: AccessRoleRecord;
  assignedUsers: AccessUserRecord[];
  matrixCatalog: RoleMatrixCatalog;
}) {
  const [role, setRole] = useState(initialRole);
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);
  const locked = role.isSystem || role.isEditable === false;

  async function saveMatrix(
    privileges: NonNullable<AccessRoleRecord["rolePrivileges"]>,
    miscPermissions = role.miscPermissions ?? [],
  ) {
    const response = await fetch(`/api/roles/${role.id}/matrix`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        privileges: privileges.map((item) => ({
          entityKey: item.entityKey,
          privilege: item.privilege,
          accessLevel: item.accessLevel,
        })),
        miscPermissions: miscPermissions.map((item) => ({
          permissionKey: item.permissionKey,
          enabled: item.enabled,
        })),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | AccessRoleRecord
      | { message?: string }
      | null;

    if (!response.ok || !payload || !("id" in payload)) {
      throw new Error(
        payload && "message" in payload
          ? payload.message ?? "Unable to save matrix."
          : "Unable to save matrix.",
      );
    }

    setRole(payload);
  }

  async function cloneRole() {
    setCloneMessage(null);
    const response = await fetch(`/api/roles/${role.id}/clone`, {
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as
      | AccessRoleRecord
      | { message?: string }
      | null;

    if (!response.ok || !payload || !("id" in payload)) {
      setCloneMessage(
        payload && "message" in payload
          ? payload.message ?? "Unable to clone role."
          : "Unable to clone role.",
      );
      return;
    }

    setCloneMessage(`Created ${payload.name}.`);
  }

  return (
    <div className="grid gap-6">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Overview
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              {role.name}
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              {role.description || "No description has been added for this role yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-muted">
              {role.key}
            </span>
            <RoleTypeBadge role={role} />
            {locked ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                Locked
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
            onClick={cloneRole}
            type="button"
          >
            Clone role
          </button>
          <Link
            className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
            href="/dashboard/settings/access/users"
          >
            Manage user access
          </Link>
        </div>
        {cloneMessage ? (
          <p className="mt-4 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-muted">
            {cloneMessage}
          </p>
        ) : null}
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Permission Matrix
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            D365-style access levels
          </h3>
        </div>
        <PermissionMatrix
          catalog={matrixCatalog}
          disabled={locked}
          initialPrivileges={role.rolePrivileges ?? []}
          onSave={(privileges) => saveMatrix(privileges)}
        />
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Miscellaneous Permissions
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Tenant administration switches
          </h3>
        </div>
        <MiscPermissionPanel
          catalog={matrixCatalog}
          disabled={locked}
          initialPermissions={role.miscPermissions ?? []}
          onSave={(miscPermissions) =>
            saveMatrix(role.rolePrivileges ?? [], miscPermissions)
          }
        />
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Assigned Users
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              {assignedUsers.length} user{assignedUsers.length === 1 ? "" : "s"}
            </h3>
          </div>
        </div>
        <AssignedUsersPanel users={assignedUsers} />
      </article>
    </div>
  );
}
