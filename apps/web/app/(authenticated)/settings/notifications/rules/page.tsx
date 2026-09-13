import { apiRequestJson } from "@/lib/server-api";
import type { NotificationEventSetting } from "@/lib/notifications-api";
import { SettingsShell } from "../../_components/settings-shell";
import {
  hasAnySettingsPermission,
  requireSettingsPermissions,
} from "../../_lib/require-settings-permission";
import type { TenantSettingsResponse } from "../../types";
import { NotificationEventsManager } from "../_components/notification-events-manager";

/*
 * ITEM-0180 (TASK-0031 WP-05). This route used to render two ~53-row tables —
 * Notification Rules and Channel Preferences, the same events twice — with one
 * Save button at the bottom, channel tiles for Browser Push and Digests that
 * nothing sends, and events that cannot fire. It is now one list of the events
 * this workspace can actually receive, each channel saving on change.
 *
 * The route is unchanged on purpose: `settings-runtime.ts` links the
 * Notifications landing card here, and existing bookmarks keep working.
 *
 * Loading and failure use the shared `(authenticated)/loading.tsx` and
 * `(authenticated)/error.tsx` boundaries: the events fetch is allowed to throw
 * into the latter, because a page of toggles drawn from a partial answer would
 * misstate what gets sent.
 */
export default async function NotificationEventsPage() {
  const user = await requireSettingsPermissions(["notifications.read"]);
  const [eventSettings, tenantSettings] = await Promise.all([
    apiRequestJson<{ items: NotificationEventSetting[] }>(
      "/notifications/event-settings",
    ),
    apiRequestJson<TenantSettingsResponse>("/tenant-settings").catch(
      () => null,
    ),
  ]);

  const emailEnabled = tenantSettings?.notifications?.emailEnabled;

  return (
    <SettingsShell
      description="Notification events"
      title="Notification Events"
    >
      <NotificationEventsManager
        // Mirrors PATCH /notifications/event-settings/:code, which declares
        // both keys because one toggle can write both the preference and the
        // event's rule. Cosmetic only — the API enforces it.
        canManageEvents={
          hasAnySettingsPermission(user, ["notifications.manage"]) &&
          hasAnySettingsPermission(user, ["notifications.manageRules"])
        }
        canManageEmail={hasAnySettingsPermission(user, ["settings.update"])}
        emailEnabled={typeof emailEnabled === "boolean" ? emailEnabled : null}
        items={eventSettings.items}
      />
    </SettingsShell>
  );
}
