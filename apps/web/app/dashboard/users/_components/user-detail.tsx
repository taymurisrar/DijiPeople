import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { UserDetailProfile } from "../types";

type UserDetailCardProps = {
  user: UserDetailProfile;
};

type UserAccessDetailCardProps = UserDetailCardProps & {
  canUpdateUser: boolean;
  canAssignRoles: boolean;
  mode?: "summary" | "full";
  formatDate: (value?: string | null) => string;
  formatDateTime: (value?: string | null) => string;
};

type UserProfileHeaderProps = UserDetailCardProps & {
  canUpdateUser: boolean;
  canDeleteUser: boolean;
  formatDateTime: (value?: string | null) => string;
};

export function UserProfileHeader({
  user,
  canUpdateUser,
  canDeleteUser,
  formatDateTime,
}: UserProfileHeaderProps) {
  return (
    <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(233,246,255,0.9))] p-8 shadow-lg">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              User Profile
            </p>

            <UserStatusBadge status={user.status} />

            {user.isServiceAccount ? (
              <StatusPill tone="muted">Service Account</StatusPill>
            ) : null}

            {user.ownership?.isTenantOwner ? (
              <StatusPill>Tenant Owner</StatusPill>
            ) : null}
          </div>

          <div>
            <h1 className="font-serif text-4xl text-foreground">
              {user.fullName || `${user.firstName} ${user.lastName}`}
            </h1>

            <p className="mt-2 text-muted">{user.email}</p>
          </div>

          <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
            <p>Business unit: {user.businessUnit?.name || "Not set"}</p>
            <p>Last login: {formatDateTime(user.lastLoginAt) || "Never"}</p>
            <p>Roles: {user.roles?.length ?? 0}</p>
            <p>
              Linked employee:{" "}
              {user.linkedEmployee?.fullName ||
                user.employee?.fullName ||
                "Not linked"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button href="/dashboard/users" variant="secondary" size="md">
            Back to list
          </Button>

          {canUpdateUser ? (
            <Button
              href={`/dashboard/users/${user.id}/edit`}
              variant="primary"
              size="md"
            >
              Edit user
            </Button>
          ) : null}

          {canDeleteUser && !user.ownership?.isTenantOwner ? (
            <Button
              href={`/dashboard/settings/access/users?userId=${user.id}`}
              variant="secondary"
              size="md"
            >
              Manage access
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function UserAccessDetailCard({
  user,
  canUpdateUser,
  canAssignRoles,
  mode = "summary",
  formatDate,
  formatDateTime,
}: UserAccessDetailCardProps) {
  const roles = user.effectiveRoles?.length ? user.effectiveRoles : user.roles;

  return (
    <SectionCard
      title={mode === "full" ? "Access Details" : "Access Summary"}
      description="Review business-unit placement, assigned roles, and login-related account information."
    >
      <div className="grid gap-6">
        <dl className="grid gap-4 md:grid-cols-2">
          <DetailItem label="First name" value={user.firstName} />
          <DetailItem label="Last name" value={user.lastName} />
          <DetailItem label="Email" value={user.email} />
          <DetailItem label="Status" value={formatLabel(user.status)} />
          <DetailItem
            label="Business unit"
            value={user.businessUnit?.name || user.businessUnitId || "Not set"}
          />
          <DetailItem
            label="Organization"
            value={
              user.businessUnit?.organizationName ||
              user.businessUnit?.organization?.name ||
              "Not set"
            }
          />
          <DetailItem
            label="Service account"
            value={user.isServiceAccount ? "Yes" : "No"}
          />
          <DetailItem
            label="Ownership"
            value={formatLabel(user.ownership?.designation || "standard_user")}
          />
          <DetailItem
            label="Last login"
            value={formatDateTime(user.lastLoginAt) || "Never"}
          />
          <DetailItem label="Created" value={formatDate(user.createdAt)} />
          <DetailItem label="Updated" value={formatDate(user.updatedAt)} />
        </dl>

        <div>
          <p className="text-sm font-medium text-foreground">Roles</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {!roles?.length ? (
              <span className="text-sm text-muted">No roles assigned</span>
            ) : (
              roles.map((role) => (
                <span
                  key={role.id}
                  className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted"
                >
                  {role.name}
                </span>
              ))
            )}
          </div>
        </div>

        {mode === "full" ? (
          <div>
            <p className="text-sm font-medium text-foreground">
              Direct permissions
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {!user.effectivePermissionKeys?.length ? (
                <span className="text-sm text-muted">
                  No effective permissions found
                </span>
              ) : (
                user.effectivePermissionKeys.slice(0, 40).map((permission) => (
                  <span
                    key={permission}
                    className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted"
                  >
                    {permission}
                  </span>
                ))
              )}

              {(user.effectivePermissionKeys?.length ?? 0) > 40 ? (
                <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted">
                  +{(user.effectivePermissionKeys?.length ?? 0) - 40} more
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {(canUpdateUser || canAssignRoles) ? (
          <div className="flex flex-wrap gap-3">
            {canUpdateUser ? (
              <Button
                href={`/dashboard/users/${user.id}/edit`}
                variant="secondary"
                size="md"
              >
                Edit profile
              </Button>
            ) : null}

            {canAssignRoles ? (
              <Button
                href={`/dashboard/settings/access/users?userId=${user.id}`}
                variant="primary"
                size="md"
              >
                Manage roles
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function UserLinkedEmployeeCard({ user }: UserDetailCardProps) {
  const employee = user.linkedEmployee ?? user.employee ?? null;

  return (
    <SectionCard
      title="Linked Employee"
      description="Authentication user-to-employee relationship used for self-service, approvals, and reporting."
    >
      {!employee ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
          This user is not linked to an employee record.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white px-4 py-4">
          <p className="font-semibold text-foreground">{employee.fullName}</p>

          <p className="mt-1 text-sm text-muted">
            {employee.employeeCode || "No employee code"}
            {employee.departmentName ? ` • ${employee.departmentName}` : ""}
          </p>

          {employee.email ? (
            <p className="mt-1 text-sm text-muted">{employee.email}</p>
          ) : null}

          <Link
            className="mt-4 inline-flex text-sm font-medium text-accent transition hover:text-accent-strong"
            href={`/dashboard/employees/${employee.id}`}
          >
            Open employee profile
          </Link>
        </div>
      )}
    </SectionCard>
  );
}

export function UserTeamsCard({ user }: UserDetailCardProps) {
  const teams = user.teams ?? user.teamMemberships ?? [];

  return (
    <SectionCard
      title="Teams"
      description="Team membership can contribute additional access through team roles."
    >
      {teams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted">
          No team memberships found.
        </div>
      ) : (
        <div className="grid gap-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="rounded-2xl border border-border bg-white px-4 py-4"
            >
              <p className="font-medium text-foreground">{team.name}</p>

              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                {formatLabel(team.teamType || "team")}
              </p>

              {team.roles?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {team.roles.map((role) => (
                    <span
                      key={role.id}
                      className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted"
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function UserSecurityDiagnosticsCard({ user }: UserDetailCardProps) {
  const privileges = user.effectivePrivileges ?? [];

  return (
    <SectionCard
      title="Security Diagnostics"
      description="Readable preview of effective roles, permissions, and highest scoped privileges."
    >
      <div className="grid gap-6">
        <DiagnosticGroup
          label="Direct roles"
          values={(user.roles ?? []).map((role) => role.name)}
        />

        <DiagnosticGroup
          label="Team roles"
          values={(user.teamRoles ?? []).map((role) => role.name)}
        />

        <DiagnosticGroup
          label="Effective roles"
          values={(user.effectiveRoles ?? user.roles ?? []).map(
            (role) => role.name,
          )}
        />

        <DiagnosticGroup
          label="Effective permissions"
          values={(user.effectivePermissionKeys ?? []).map(formatLabel)}
        />

        <div>
          <p className="text-sm font-medium text-foreground">
            Highest scope by module/action
          </p>

          {privileges.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No scoped privileges.</p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {privileges
                .filter((privilege) => privilege.accessLevel !== "NONE")
                .slice(0, 24)
                .map((privilege) => (
                  <div
                    key={`${privilege.entityKey}:${privilege.privilege}`}
                    className="rounded-2xl border border-border bg-white px-4 py-4 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      {formatLabel(privilege.entityKey)} /{" "}
                      {formatLabel(privilege.privilege)}
                    </p>

                    <p className="mt-1 text-muted">
                      {formatAccessScope(privilege.accessLevel)}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function UserStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();

  const tone =
    normalized === "ACTIVE"
      ? "good"
      : normalized === "SUSPENDED" || normalized === "INACTIVE"
        ? "danger"
        : "muted";

  return <StatusPill tone={tone}>{formatLabel(status)}</StatusPill>;
}

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value || "Not set"}</dd>
    </div>
  );
}

function DiagnosticGroup({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {values.length === 0 ? (
          <span className="text-sm text-muted">None</span>
        ) : (
          values.slice(0, 32).map((value) => (
            <span
              key={value}
              className="rounded-full bg-white px-3 py-1 text-xs text-muted"
            >
              {value}
            </span>
          ))
        )}

        {values.length > 32 ? (
          <span className="rounded-full bg-white px-3 py-1 text-xs text-muted">
            +{values.length - 32} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatLabel(value: string) {
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
    : formatLabel(value);
}