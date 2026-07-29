import { redirect } from "next/navigation";

type EditSecurityAccessRolePageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function EditSecurityAccessRolePage({
  params,
}: EditSecurityAccessRolePageProps) {
  const { roleId } = await params;
  redirect(`/settings/security-access/authorization/roles/${roleId}`);
}
