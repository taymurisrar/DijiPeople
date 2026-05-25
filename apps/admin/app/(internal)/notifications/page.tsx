import {
  AdminKeyValueGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { requireSystemAdminUser } from "@/lib/auth";

export default async function NotificationsPage() {
  const user = await requireSystemAdminUser("/notifications");

  return (
    <AdminWorkspace>
      <AdminPageHeader
        eyebrow="Notifications"
        title="Notifications"
        description="System notification delivery is controlled centrally until a per-user notification preference API is available."
      />
      <AdminSectionCard title="Notification identity">
        <AdminKeyValueGrid
          items={[
            { label: "Recipient", value: user.email },
            { label: "Tenant", value: user.tenantName },
            { label: "Delivery mode", value: "System controlled" },
          ]}
        />
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
          No local notification toggles are shown because there is no current
          UI behavior they would affect.
        </div>
      </AdminSectionCard>
    </AdminWorkspace>
  );
}
