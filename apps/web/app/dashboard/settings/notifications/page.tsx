import { apiRequestJson } from "@/lib/server-api";
import type {
  NotificationEvent,
  NotificationPreferenceItem,
} from "@/lib/notifications-api";
import { SettingsShell } from "../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../_lib/require-settings-permission";
import { NotificationPreferencesManager } from "./_components/notification-preferences-manager";
import type { TenantSettingsResponse } from "../types";

export default async function NotificationSettingsPage() {
  const user = await requireSettingsPermissions(["notifications.read"]);
  const [events, preferences, tenantSettings] = await Promise.all([
    apiRequestJson<NotificationEvent[]>("/notifications/events"),
    apiRequestJson<{
      items: NotificationPreferenceItem[];
      sourceOfTruth?: string;
    }>("/notifications/preferences"),
    apiRequestJson<TenantSettingsResponse>("/tenant-settings").catch(
      () => ({}) as TenantSettingsResponse,
    ),
  ]);
  const canManage = hasAnySettingsPermission(user, ["notifications.manage"]);

  return (
    <SettingsShell
      description="Manage tenant-wide notification event preferences and channel enablement across template-backed communication workflows."
      eyebrow="Notifications"
      title="Notification Settings"
    >
      <NotificationPreferencesManager
        canManage={canManage}
        events={events}
        globalSettings={tenantSettings.notifications ?? {}}
        preferences={preferences.items}
        sourceOfTruth={preferences.sourceOfTruth}
      />
    </SettingsShell>
  );
}
