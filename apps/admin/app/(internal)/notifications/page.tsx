import type { Metadata } from "next";
import { NotificationsFeed } from "@/app/_components/notifications/notifications-feed";
import { AdminPageHeader, AdminWorkspace } from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Notifications",
};


export default async function NotificationsPage() {
  await requireSystemAdminUser("/notifications");

  return (
    <AdminWorkspace>
      <AdminPageHeader
        eyebrow="Notifications"
        title="Notifications"
        description="Provisioning, billing and delivery failures that need someone. Routine activity stays in the event log."
      />
      <NotificationsFeed />
    </AdminWorkspace>
  );
}
