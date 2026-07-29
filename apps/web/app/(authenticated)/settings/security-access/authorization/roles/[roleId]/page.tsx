import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import { RoleDetailClient } from "../../../../_components/role-detail-client";
import { SettingsShell } from "../../../../_components/settings-shell";
import type {
  AccessRoleRecord,
  AccessUserRecord,
  RoleMatrixCatalog,
} from "../../../../types";

type SecurityAccessRoleDetailPageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function SecurityAccessRoleDetailPage({
  params,
}: SecurityAccessRoleDetailPageProps) {
  await requireSettingsPermissions([PERMISSION_KEYS.ROLES_READ]);
  const { roleId } = await params;

  const [role, roles, users, matrixCatalog] = await Promise.all([
    apiRequestJson<AccessRoleRecord>(`/roles/${roleId}`),
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<AccessUserRecord[]>("/users"),
    apiRequestJson<RoleMatrixCatalog>("/roles/matrix/catalog"),
  ]);

  const assignedUsers = users.filter((user) =>
    user.roles.some((userRole) => userRole.id === role.id),
  );

  return (
    <SettingsShell
      description="Review role scope, matrix privileges, administrative switches, assigned users, and protected system-role behavior."
      eyebrow="Role Designer"
      title={role.name}
    >
      <RoleDetailClient
        assignedUsers={assignedUsers}
        initialRole={role}
        matrixCatalog={matrixCatalog}
        roles={roles}
      />
    </SettingsShell>
  );
}
