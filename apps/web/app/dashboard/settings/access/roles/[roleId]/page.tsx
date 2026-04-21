import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { SettingsShell } from "../../../_components/settings-shell";
import { AccessRoleRecord, AccessUserRecord } from "../../../types";

type RoleDetailPageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function RoleDetailPage({ params }: RoleDetailPageProps) {
  await requireSettingsPermissions(["roles.read"]);
  const { roleId } = await params;

  const [role, users] = await Promise.all([
    apiRequestJson<AccessRoleRecord>(`/roles/${roleId}`),
    apiRequestJson<AccessUserRecord[]>("/users"),
  ]);

  const assignedUsers = users.filter((user) =>
    user.roles.some((userRole) => userRole.id === role.id),
  );
  const permissionGroups = groupPermissions(role);

  return (
    <SettingsShell
      description="Review role metadata, assigned permissions, and the users currently operating with this access bundle."
      eyebrow="Role & Access Management"
      title={role.name}
    >
      <div className="grid gap-6 xl:grid-cols-[0.58fr_0.42fr]">
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">Role</p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">
                {role.name}
              </h3>
              <p className="mt-2 text-sm text-muted">
                {role.description || "No description has been added for this role yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
                {role.key}
              </span>
              {role.isSystem ? (
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
                  System role
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {permissionGroups.map((group) => (
              <section
                className="rounded-2xl border border-border bg-white/80 px-4 py-4"
                key={group.key}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-medium text-foreground">{group.label}</h4>
                  <span className="text-xs uppercase tracking-[0.16em] text-muted">
                    {group.items.length}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.items.map((permission) => (
                    <span
                      className="rounded-full bg-surface px-3 py-1 text-xs text-muted"
                      key={permission.id}
                    >
                      {permission.key}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>

        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                Assigned Users
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">
                {assignedUsers.length} user{assignedUsers.length === 1 ? "" : "s"}
              </h3>
            </div>
            <Link
              className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
              href="/dashboard/settings/access/users"
            >
              Manage user access
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {assignedUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-4 text-sm text-muted">
                No users are currently assigned to this role.
              </div>
            ) : (
              assignedUsers.map((user) => (
                <div
                  className="rounded-2xl border border-border bg-white/80 px-4 py-4"
                  key={user.userId}
                >
                  <p className="font-medium text-foreground">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="mt-1 text-sm text-muted">{user.email}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">
                    {user.ownership.designation.replaceAll("_", " ")}
                  </p>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </SettingsShell>
  );
}

function groupPermissions(role: AccessRoleRecord) {
  const grouped = new Map<
    string,
    Array<{ id: string; key: string; name: string }>
  >();

  role.rolePermissions.forEach((item) => {
    const key = item.permission.key.split(".")[0] || "general";
    const items = grouped.get(key) ?? [];
    items.push(item.permission);
    grouped.set(key, items);
  });

  return Array.from(grouped.entries())
    .map(([key, items]) => ({
      key,
      label: key
        .split(/[-_.]/g)
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" "),
      items: [...items].sort((left, right) => left.key.localeCompare(right.key)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
