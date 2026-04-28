import { apiRequestJson } from "@/lib/server-api";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { RoleDetailClient } from "../../../_components/role-detail-client";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  AccessRoleRecord,
  AccessUserRecord,
  RoleMatrixCatalog,
} from "../../../types";

type RoleDetailPageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function RoleDetailPage({ params }: RoleDetailPageProps) {
  await requireSettingsPermissions(["roles.read"]);
  const { roleId } = await params;

  const [role, users, matrixCatalog] = await Promise.all([
    apiRequestJson<AccessRoleRecord>(`/roles/${roleId}`),
    apiRequestJson<AccessUserRecord[]>("/users"),
    apiRequestJson<RoleMatrixCatalog>("/roles/matrix/catalog"),
  ]);

  const assignedUsers = users.filter((user) =>
    user.roles.some((userRole) => userRole.id === role.id),
  );

  return (
    <SettingsShell
      description="Review role scope, matrix privileges, miscellaneous permissions, assigned users, and locked system-role behavior."
      eyebrow="Role & Access Management"
      title={role.name}
    >
      <RoleDetailClient
        assignedUsers={assignedUsers}
        initialRole={role}
        matrixCatalog={matrixCatalog}
      />
    </SettingsShell>
  );
}
