import { AccountPreferencesClient } from "@/app/_components/account-preferences-client";
import { AdminPageHeader, AdminWorkspace } from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

export default async function PreferencesPage() {
  await requireSystemAdminUser("/preferences");

  return (
    <AdminWorkspace>
      <AdminPageHeader
        eyebrow="Preferences"
        title="Workspace preferences"
        description="Personal UI preferences for this admin workspace."
      />
      <AccountPreferencesClient />
    </AdminWorkspace>
  );
}
