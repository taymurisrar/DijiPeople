import { NotificationsFeed } from "@/app/_components/notifications/notifications-feed";
import { AdminPageHeader, AdminWorkspace } from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

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
