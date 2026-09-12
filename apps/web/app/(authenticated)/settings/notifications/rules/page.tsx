import { apiRequestJson } from "@/lib/server-api";
import type {
  NotificationEvent,
  NotificationPreferenceItem,
  NotificationRuleItem,
} from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import type { TenantSettingsResponse } from "../../types";
import { NotificationRulesManager } from "../_components/notification-rules-manager";

/*
 * BUG-3375. This screen used to be named "Notification Rules" while
 * rendering only `NotificationPreference` data — a per-event channel opt-in —
 * with no way to see or change a `NotificationRule`, the model that actually
 * decides whether an event can fire at all. It now fetches both, and the
 * heading, this page's title and the manager component's own section titles
 * agree on what the screen manages: rules AND channel preferences for the
 * same catalog of events.
 */
export default async function NotificationRulesPage() {
  const user = await requireSettingsPermissions(["notifications.read"]);
  const [events, preferences, rules, tenantSettings] = await Promise.all([
    apiRequestJson<NotificationEvent[]>("/notifications/events"),
    apiRequestJson<{ items: NotificationPreferenceItem[] }>(
      "/notifications/preferences",
    ),
    apiRequestJson<{ items: NotificationRuleItem[] }>("/notifications/rules"),
    apiRequestJson<TenantSettingsResponse>("/tenant-settings").catch(
      () => ({}) as TenantSettingsResponse,
    ),
  ]);
  return (
    <SettingsShell
      description="See which events can notify anyone at all, and which channels each one uses."
      title="Notification Rules"
    >
      <NotificationRulesManager
        canManagePreferences={hasAnySettingsPermission(user, [
          "notifications.manage",
        ])}
        canManageRules={hasAnySettingsPermission(user, [
          "notifications.manageRules",
        ])}
        events={events}
        globalSettings={tenantSettings.notifications ?? {}}
        preferences={preferences.items}
        rules={rules.items}
      />
    </SettingsShell>
  );
}
