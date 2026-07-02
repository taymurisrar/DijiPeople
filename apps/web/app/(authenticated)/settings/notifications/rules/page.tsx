import { apiRequestJson } from "@/lib/server-api";
import type {
  NotificationEvent,
  NotificationPreferenceItem,
} from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import type { TenantSettingsResponse } from "../../types";
import { NotificationPreferencesManager } from "../_components/notification-preferences-manager";

export default async function NotificationRulesPage() {
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
  return (
    <SettingsShell
      description="Manage event preferences and channel enablement."
      title="Notification Rules"
    >
      <NotificationPreferencesManager
        canManage={hasAnySettingsPermission(user, ["notifications.manage"])}
        events={events}
        globalSettings={tenantSettings.notifications ?? {}}
        preferences={preferences.items}
        sourceOfTruth={preferences.sourceOfTruth}
      />
    </SettingsShell>
  );
}
