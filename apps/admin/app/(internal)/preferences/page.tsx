import type { Metadata } from "next";
import { AccountPreferencesClient } from "@/app/_components/account-preferences-client";
import { AdminPageHeader, AdminWorkspace } from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Preferences",
};


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
