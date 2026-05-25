import {
  AdminKeyValueGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

export default async function AccountSettingsPage() {
  const user = await requireSystemAdminUser("/account-settings");

  return (
    <AdminWorkspace>
      <AdminPageHeader
        eyebrow="Account"
        title="Account settings"
        description="Account details available from the current authenticated session."
      />
      <AdminSectionCard title="Account summary">
        <AdminKeyValueGrid
          items={[
            { label: "User ID", value: user.userId },
            { label: "Email", value: user.email },
            { label: "Tenant ID", value: user.tenantId },
            { label: "Tenant", value: user.tenantName },
            { label: "Role IDs", value: user.roleIds.join(", ") },
            { label: "Role keys", value: user.roleKeys?.join(", ") },
          ]}
        />
      </AdminSectionCard>
    </AdminWorkspace>
  );
}
