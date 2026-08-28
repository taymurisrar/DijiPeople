import type { Metadata } from "next";
import {
  AdminKeyValueGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Account Settings",
};


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
