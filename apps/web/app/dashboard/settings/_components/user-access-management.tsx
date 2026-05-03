"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  AccessRoleRecord,
  AccessUserRecord,
  BusinessUnitRecord,
} from "../types";
import { RoleTypeBadge } from "./rbac-components";

type TeamRecord = {
  id: string;
  name: string;
  key: string;
  teamType: string;
  isActive: boolean;
  members?: Array<{ userId: string }>;
  teamRoles?: Array<{
    role: { id: string; name: string; key: string; isSystem: boolean };
  }>;
};

type EmployeeSearchItem = {
  id: string;
  employeeCode: string;
  fullName: string;
  email?: string | null;
  departmentName?: string | null;
  businessUnit?: {
    id: string;
    name: string;
    organizationName: string;
  } | null;
  linkedUser?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

type EmployeeSearchResponse = {
  items: EmployeeSearchItem[];
};

type UserAccessManagementProps = {
  initialUsers: AccessUserRecord[];
  roles: AccessRoleRecord[];
  businessUnits: BusinessUnitRecord[];
  teams: TeamRecord[];
};

type ConfirmState =
  | { type: "delete-user"; user: AccessUserRecord }
  | { type: "unlink-employee"; user: AccessUserRecord }
  | null;

const PROTECTED_OWNER_ROLE_KEYS = new Set([
  "system-administrator",
  "system-admin",
  "tenant-owner",
  "owner",
]);

export function UserAccessManagement({
  initialUsers,
  roles,
  businessUnits,
  teams,
}: UserAccessManagementProps) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(
    initialUsers[0]?.userId ?? "",
  );
  const [roleQuery, setRoleQuery] = useState("");
  const [pendingRoleIds, setPendingRoleIds] = useState<Record<string, string[]>>(
    {},
  );
  const [pendingBusinessUnitIds, setPendingBusinessUnitIds] = useState<
    Record<string, string>
  >({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savingAccess, setSavingAccess] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [linkingUser, setLinkingUser] = useState<AccessUserRecord | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeResults, setEmployeeResults] = useState<EmployeeSearchItem[]>(
    [],
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeSearchLoading, setEmployeeSearchLoading] = useState(false);

  const selectedUser =
    users.find((user) => user.userId === selectedUserId) ?? users[0] ?? null;

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      [
        `${user.firstName} ${user.lastName}`,
        user.email,
        user.status,
        user.linkedEmployee?.fullName,
        user.linkedEmployee?.employeeCode,
        user.businessUnit?.name,
        user.businessUnit?.organizationName,
        ...user.roles.map((role) => role.name),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, users]);

  const businessUnitOptions = useMemo(
    () => buildBusinessUnitOptions(businessUnits),
    [businessUnits],
  );

  const selectedTeamMemberships = useMemo(() => {
    if (!selectedUser) {
      return [];
    }

    return teams.filter((team) =>
      team.members?.some((member) => member.userId === selectedUser.userId),
    );
  }, [selectedUser, teams]);

  function getPendingRoleIds(user: AccessUserRecord) {
    return pendingRoleIds[user.userId] ?? user.roles.map((role) => role.id);
  }

  function getPendingBusinessUnitId(user: AccessUserRecord) {
    return pendingBusinessUnitIds[user.userId] ?? user.businessUnitId ?? "";
  }

  function isProtectedOwnerCoreRole(
    user: AccessUserRecord,
    role: AccessRoleRecord,
  ) {
    return (
      user.ownership.isTenantOwner &&
      PROTECTED_OWNER_ROLE_KEYS.has(role.key.toLowerCase())
    );
  }

  async function saveUserAccess(user: AccessUserRecord) {
    setSavingAccess(true);
    setError("");
    setMessage("");

    try {
      const roleIds = getPendingRoleIds(user);
      const businessUnitId = getPendingBusinessUnitId(user);

      if (!businessUnitId) {
        setError("Choose a business unit before saving access.");
        return;
      }

      const [rolesResponse, buResponse] = await Promise.all([
        fetch(`/api/users/${user.userId}/roles`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleIds }),
        }),
        fetch(`/api/users/${user.userId}/business-unit`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessUnitId }),
        }),
      ]);

      const rolesPayload = (await rolesResponse.json().catch(() => null)) as
        | AccessUserRecord
        | { message?: string }
        | null;

      const buPayload = (await buResponse.json().catch(() => null)) as
        | AccessUserRecord
        | { message?: string }
        | null;

      if (!rolesResponse.ok || !buResponse.ok) {
        setError(extractMessage(rolesPayload) || extractMessage(buPayload));
        return;
      }

      const updatedUser =
        buPayload && "userId" in buPayload
          ? buPayload
          : rolesPayload && "userId" in rolesPayload
            ? rolesPayload
            : null;

      if (!updatedUser) {
        setError("Unable to refresh the updated user.");
        return;
      }

      replaceUser(updatedUser);
      setMessage("User access updated.");
    } catch {
      setError("User access update failed. Check that the API is running.");
    } finally {
      setSavingAccess(false);
    }
  }

  async function searchEmployees() {
    setEmployeeSearchLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/employees/linking-search?q=${encodeURIComponent(employeeQuery)}`,
      );

      const payload = (await response.json().catch(() => null)) as
        | EmployeeSearchResponse
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("items" in payload)) {
        setError(extractMessage(payload) || "Unable to search employees.");
        return;
      }

      setEmployeeResults(payload.items);
    } catch {
      setError("Employee search failed. Check that the API is running.");
    } finally {
      setEmployeeSearchLoading(false);
    }
  }

  async function linkEmployee() {
    if (!linkingUser || !selectedEmployeeId) {
      setError("Choose an employee to link.");
      return;
    }

    setSavingAccess(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/users/${linkingUser.userId}/link-employee`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: selectedEmployeeId }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | AccessUserRecord
        | { message?: string }
        | null;

      if (!response.ok || !payload || !("userId" in payload)) {
        setError(extractMessage(payload) || "Unable to link employee.");
        return;
      }

      replaceUser(payload);
      setLinkingUser(null);
      setSelectedEmployeeId("");
      setEmployeeResults([]);
      setMessage("Employee linked.");
    } catch {
      setError("Employee link failed. Check that the API is running.");
    } finally {
      setSavingAccess(false);
    }
  }

  async function runConfirmedAction() {
    if (!confirmState) {
      return;
    }

    setSavingAccess(true);
    setError("");
    setMessage("");

    try {
      if (confirmState.type === "unlink-employee") {
        const response = await fetch(
          `/api/users/${confirmState.user.userId}/link-employee`,
          { method: "DELETE" },
        );

        const payload = (await response.json().catch(() => null)) as
          | AccessUserRecord
          | { message?: string }
          | null;

        if (!response.ok || !payload || !("userId" in payload)) {
          setError(extractMessage(payload) || "Unable to unlink employee.");
          return;
        }

        replaceUser(payload);
        setMessage("Employee unlinked.");
      }

      if (confirmState.type === "delete-user") {
        const response = await fetch(`/api/users/${confirmState.user.userId}`, {
          method: "DELETE",
        });

        const payload = (await response.json().catch(() => null)) as
          | { deleted?: boolean; message?: string }
          | null;

        if (!response.ok || !payload?.deleted) {
          setError(extractMessage(payload) || "Unable to delete user.");
          return;
        }

        setUsers((current) =>
          current.filter((user) => user.userId !== confirmState.user.userId),
        );
        setMessage("User deleted.");
      }

      setConfirmState(null);
    } catch {
      setError("The requested action failed. Check that the API is running.");
    } finally {
      setSavingAccess(false);
    }
  }

  function replaceUser(updatedUser: AccessUserRecord) {
    setUsers((current) =>
      current.map((user) =>
        user.userId === updatedUser.userId ? updatedUser : user,
      ),
    );
    setSelectedUserId(updatedUser.userId);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard
        description="Search users, inspect linked employees, and open access details without leaving tenant settings."
        title="Users"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            className="min-h-11 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 sm:max-w-md"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, employee, BU, role"
            value={query}
          />

          <Link
            className="rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/settings/access/users/new"
          >
            New user
          </Link>
        </div>

        {filteredUsers.length === 0 ? (
          <EmptyState
            description="Try another search term or create a new tenant user."
            title="No users found"
          />
        ) : (
          <div className="grid gap-3">
            {filteredUsers.map((user) => (
              <button
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selectedUser?.userId === user.userId
                    ? "border-accent bg-accent-soft/40"
                    : "border-border bg-white hover:border-accent/40"
                }`}
                key={user.userId}
                onClick={() => setSelectedUserId(user.userId)}
                type="button"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">
                        {user.firstName} {user.lastName}
                      </p>

                      <UserStatusBadge status={user.status} />

                      {user.ownership.isTenantOwner ? (
                        <StatusPill>Tenant Owner</StatusPill>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm text-muted">{user.email}</p>

                    <p className="mt-2 text-sm text-muted">
                      {user.linkedEmployee
                        ? `${user.linkedEmployee.fullName} (${user.linkedEmployee.employeeCode})`
                        : "No linked employee"}
                    </p>
                  </div>

                  <div className="grid gap-2 text-sm text-muted lg:text-right">
                    <span>{user.businessUnit?.name ?? "No business unit"}</span>
                    <span>
                      {formatDateTime(user.lastLoginAt) || "Never logged in"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {user.roles.slice(0, 4).map((role) => (
                    <span
                      className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted"
                      key={role.id}
                    >
                      {role.name}
                    </span>
                  ))}

                  {user.roles.length > 4 ? (
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
                      +{user.roles.length - 4} more
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedUser ? (
        <div className="grid gap-6">
          <SectionCard
            description="Profile, tenant position, and account status."
            title="Profile Summary"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-foreground">
                  {selectedUser.firstName} {selectedUser.lastName}
                </h3>

                <p className="mt-1 text-sm text-muted">{selectedUser.email}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <UserStatusBadge status={selectedUser.status} />

                  <StatusPill tone="muted">
                    {formatOwnershipLabel(selectedUser.ownership.designation)}
                  </StatusPill>

                  {selectedUser.isServiceAccount ? (
                    <StatusPill tone="muted">Service Account</StatusPill>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-2xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                  onClick={() => {
                    setLinkingUser(selectedUser);
                    setEmployeeQuery(selectedUser.email);
                    setEmployeeResults([]);
                    setSelectedEmployeeId("");
                  }}
                  type="button"
                >
                  {selectedUser.linkedEmployee ? "Change link" : "Link employee"}
                </button>

                {selectedUser.linkedEmployee ? (
                  <button
                    className="rounded-2xl border border-danger/20 px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/5"
                    disabled={selectedUser.ownership.isTenantOwner}
                    onClick={() =>
                      setConfirmState({
                        type: "unlink-employee",
                        user: selectedUser,
                      })
                    }
                    type="button"
                  >
                    Unlink
                  </button>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            description="Assign roles and business-unit placement. System roles are clearly marked."
            title="Access Summary"
          >
            <div className="grid gap-5">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-foreground">Business unit</span>

                <select
                  className="rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                  disabled={selectedUser.ownership.isTenantOwner}
                  onChange={(event) =>
                    setPendingBusinessUnitIds((current) => ({
                      ...current,
                      [selectedUser.userId]: event.target.value,
                    }))
                  }
                  value={getPendingBusinessUnitId(selectedUser)}
                >
                  <option value="">Select business unit</option>

                  {businessUnitOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-medium text-foreground">Assigned roles</h4>

                  <input
                    className="min-h-10 rounded-2xl border border-border bg-white px-4 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    onChange={(event) => setRoleQuery(event.target.value)}
                    placeholder="Search roles"
                    value={roleQuery}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {roles
                    .filter((role) =>
                      roleQuery
                        ? `${role.name} ${role.description ?? ""} ${role.key}`
                            .toLowerCase()
                            .includes(roleQuery.toLowerCase())
                        : true,
                    )
                    .map((role) => {
                      const assigned = getPendingRoleIds(selectedUser).includes(
                        role.id,
                      );

                      const protectedOwnerCoreRole =
                        isProtectedOwnerCoreRole(selectedUser, role) && assigned;

                      return (
                        <label
                          className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm ${
                            assigned
                              ? "border-accent bg-accent-soft/40"
                              : "border-border bg-white"
                          } ${
                            protectedOwnerCoreRole
                              ? "cursor-not-allowed opacity-80"
                              : "cursor-pointer"
                          }`}
                          key={role.id}
                        >
                          <input
                            checked={assigned}
                            disabled={protectedOwnerCoreRole}
                            onChange={() =>
                              setPendingRoleIds((current) => ({
                                ...current,
                                [selectedUser.userId]: assigned
                                  ? getPendingRoleIds(selectedUser).filter(
                                      (id) => id !== role.id,
                                    )
                                  : [...getPendingRoleIds(selectedUser), role.id],
                              }))
                            }
                            type="checkbox"
                          />

                          <span>
                            <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                              {role.name}
                              <RoleTypeBadge role={role} />

                              {protectedOwnerCoreRole ? (
                                <StatusPill tone="muted">Protected</StatusPill>
                              ) : null}
                            </span>

                            <span className="mt-1 block text-muted">
                              {role.description || startCase(role.key)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {selectedUser.ownership.isTenantOwner ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Tenant Owner core access is protected. You can assign
                  additional roles to this user, but the core owner/admin role
                  cannot be removed.
                </p>
              ) : null}

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

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
                  disabled={savingAccess}
                  onClick={() => saveUserAccess(selectedUser)}
                  type="button"
                >
                  {savingAccess ? "Saving..." : "Save access"}
                </button>

                <button
                  className="rounded-2xl border border-danger/20 px-5 py-3 text-sm font-medium text-danger transition hover:bg-danger/5 disabled:opacity-60"
                  disabled={selectedUser.ownership.isTenantOwner}
                  onClick={() =>
                    setConfirmState({ type: "delete-user", user: selectedUser })
                  }
                  type="button"
                >
                  Delete user
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            description="Employee relationship and team-based access contributors."
            title="Linked Employee & Teams"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-white px-4 py-4">
                <p className="text-sm font-medium text-foreground">
                  Linked employee
                </p>

                {selectedUser.linkedEmployee ? (
                  <div className="mt-3">
                    <p className="font-semibold text-foreground">
                      {selectedUser.linkedEmployee.fullName}
                    </p>

                    <p className="mt-1 text-sm text-muted">
                      {selectedUser.linkedEmployee.employeeCode}
                      {selectedUser.linkedEmployee.departmentName
                        ? ` • ${selectedUser.linkedEmployee.departmentName}`
                        : ""}
                    </p>

                    <Link
                      className="mt-3 inline-flex text-sm font-medium text-accent"
                      href={`/dashboard/employees/${selectedUser.linkedEmployee.id}`}
                    >
                      Open employee profile
                    </Link>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    This user is not linked to an employee record.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-white px-4 py-4">
                <p className="text-sm font-medium text-foreground">Teams</p>

                <div className="mt-3 grid gap-2">
                  {selectedTeamMemberships.length === 0 ? (
                    <p className="text-sm text-muted">No team memberships.</p>
                  ) : (
                    selectedTeamMemberships.map((team) => (
                      <div
                        className="rounded-2xl border border-border bg-surface px-3 py-3"
                        key={team.id}
                      >
                        <p className="font-medium text-foreground">{team.name}</p>

                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                          {startCase(team.teamType)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            description="A readable preview of role-derived access. Use this for support and diagnostics."
            title="Security Diagnostics"
          >
            <div className="grid gap-4">
              {selectedUser.effectivePermissionKeys.length === 0 ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This user has no meaningful effective access. Add a direct role
                  or team membership with roles.
                </p>
              ) : null}

              <DiagnosticGroup
                label="Direct roles"
                values={selectedUser.roles.map((role) => role.name)}
              />

              <DiagnosticGroup
                label="Team roles"
                values={(selectedUser.teamRoles ?? []).map((role) => role.name)}
              />

              <DiagnosticGroup
                label="Effective roles"
                values={(selectedUser.effectiveRoles ?? selectedUser.roles).map(
                  (role) => role.name,
                )}
              />

              <DiagnosticGroup
                label="Effective permissions"
                values={selectedUser.effectivePermissionKeys.map(startCase)}
              />

              <EffectiveScopeSummary
                privileges={selectedUser.effectivePrivileges ?? []}
              />
            </div>
          </SectionCard>
        </div>
      ) : (
        <EmptyState
          description="Create a user or adjust your filters."
          title="No user selected"
        />
      )}

      <EmployeeLinkDialog
        employeeQuery={employeeQuery}
        employeeResults={employeeResults}
        isLoading={employeeSearchLoading || savingAccess}
        onClose={() => setLinkingUser(null)}
        onEmployeeQueryChange={setEmployeeQuery}
        onLink={linkEmployee}
        onSearch={searchEmployees}
        onSelectEmployee={setSelectedEmployeeId}
        open={Boolean(linkingUser)}
        selectedEmployeeId={selectedEmployeeId}
        user={linkingUser}
      />

      <ConfirmDialog
        confirmAction={{
          label:
            confirmState?.type === "delete-user" ? "Delete user" : "Unlink",
          onClick: runConfirmedAction,
          variant: "danger",
        }}
        description={
          confirmState?.type === "delete-user"
            ? "This removes the tenant user account. Employee records are not deleted."
            : "This removes the authentication link. The employee record remains intact."
        }
        isLoading={savingAccess}
        onClose={() => setConfirmState(null)}
        open={Boolean(confirmState)}
        title={
          confirmState?.type === "delete-user"
            ? "Delete this user?"
            : "Unlink this employee?"
        }
      />
    </div>
  );
}

function EffectiveScopeSummary({
  privileges,
}: {
  privileges: NonNullable<AccessUserRecord["effectivePrivileges"]>;
}) {
  const topPrivileges = privileges
    .filter((privilege) => privilege.accessLevel !== "NONE")
    .slice(0, 18);

  return (
    <div>
      <p className="text-sm font-medium text-foreground">
        Highest scope by module/action
      </p>

      {topPrivileges.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No scoped privileges.</p>
      ) : (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {topPrivileges.map((privilege) => (
            <div
              className="rounded-2xl border border-border bg-white px-3 py-3 text-sm"
              key={`${privilege.entityKey}:${privilege.privilege}`}
            >
              <p className="font-medium text-foreground">
                {startCase(privilege.entityKey)} /{" "}
                {startCase(privilege.privilege)}
              </p>

              <p className="mt-1 text-muted">
                {formatAccessScope(privilege.accessLevel)}
              </p>
            </div>
          ))}
        </div>
      )}

      {privileges.length > topPrivileges.length ? (
        <p className="mt-2 text-xs text-muted">
          +{privileges.length - topPrivileges.length} more scoped privileges
        </p>
      ) : null}
    </div>
  );
}

function EmployeeLinkDialog({
  employeeQuery,
  employeeResults,
  isLoading,
  onClose,
  onEmployeeQueryChange,
  onLink,
  onSearch,
  onSelectEmployee,
  open,
  selectedEmployeeId,
  user,
}: {
  employeeQuery: string;
  employeeResults: EmployeeSearchItem[];
  isLoading: boolean;
  onClose: () => void;
  onEmployeeQueryChange: (value: string) => void;
  onLink: () => void;
  onSearch: () => void;
  onSelectEmployee: (value: string) => void;
  open: boolean;
  selectedEmployeeId: string;
  user: AccessUserRecord | null;
}) {
  if (!open || !user) {
    return null;
  }

  const selectedEmployee = employeeResults.find(
    (employee) => employee.id === selectedEmployeeId,
  );

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/35">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Employee Link
            </p>

            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Link employee to {user.firstName} {user.lastName}
            </h3>

            <p className="mt-2 text-sm text-muted">
              Search by employee name, code, department, or work email.
            </p>
          </div>

          <button
            className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            className="min-h-11 flex-1 rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => onEmployeeQueryChange(event.target.value)}
            placeholder="Search employees"
            value={employeeQuery}
          />

          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
            disabled={isLoading}
            onClick={onSearch}
            type="button"
          >
            {isLoading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {employeeResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
              Search for an employee to link.
            </div>
          ) : (
            employeeResults.map((employee) => {
              const blocked =
                employee.linkedUser && employee.linkedUser.id !== user.userId;

              return (
                <label
                  className={`grid gap-2 rounded-2xl border px-4 py-4 ${
                    selectedEmployeeId === employee.id
                      ? "border-accent bg-accent-soft/40"
                      : "border-border bg-surface"
                  } ${blocked ? "opacity-65" : ""}`}
                  key={employee.id}
                >
                  <span className="flex items-start gap-3">
                    <input
                      checked={selectedEmployeeId === employee.id}
                      disabled={Boolean(blocked)}
                      onChange={() => onSelectEmployee(employee.id)}
                      type="radio"
                    />

                    <span>
                      <span className="block font-semibold text-foreground">
                        {employee.fullName}
                      </span>

                      <span className="mt-1 block text-sm text-muted">
                        {employee.employeeCode}
                        {employee.departmentName
                          ? ` • ${employee.departmentName}`
                          : ""}
                      </span>

                      <span className="mt-1 block text-sm text-muted">
                        {employee.businessUnit
                          ? `${employee.businessUnit.name} (${employee.businessUnit.organizationName})`
                          : "No business unit"}
                      </span>

                      {blocked ? (
                        <span className="mt-2 block text-sm font-medium text-danger">
                          Already linked to {employee.linkedUser?.fullName}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        {selectedEmployee ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            Confirm that {selectedEmployee.fullName} is the correct employee.
            {selectedEmployee.businessUnit?.id &&
            selectedEmployee.businessUnit.id !== user.businessUnitId
              ? " This employee is in a different business unit than the user."
              : ""}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>

          <button
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
            disabled={isLoading || !selectedEmployeeId}
            onClick={onLink}
            type="button"
          >
            Link employee
          </button>
        </div>
      </aside>
    </div>
  );
}

function DiagnosticGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {values.length === 0 ? (
          <span className="text-sm text-muted">None</span>
        ) : (
          values.slice(0, 28).map((value) => (
            <span
              className="rounded-full bg-white px-3 py-1 text-xs text-muted"
              key={value}
            >
              {value}
            </span>
          ))
        )}

        {values.length > 28 ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs text-muted">
            +{values.length - 28} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

function UserStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  return (
    <StatusPill tone={normalized === "active" ? "good" : "muted"}>
      {startCase(status)}
    </StatusPill>
  );
}

function buildBusinessUnitOptions(businessUnits: BusinessUnitRecord[]) {
  return [...businessUnits]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((unit) => ({
      id: unit.id,
      label: `${unit.name}${
        unit.organization?.name ? ` (${unit.organization.name})` : ""
      }`,
    }));
}

function extractMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    return typeof message === "string" ? message : "Request failed.";
  }

  return "Request failed.";
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatOwnershipLabel(
  value: AccessUserRecord["ownership"]["designation"],
) {
  return startCase(value);
}

function startCase(value: string) {
  return value
    .toLowerCase()
    .split(/[-_ .]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAccessScope(value: string) {
  return value === "PARENT_CHILD_BUSINESS_UNIT" ||
    value === "PARENT_CHILD_BUSINESS_UNITS"
    ? "Parent & Child Business Units"
    : startCase(value);
}