"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import {
  NotificationChannel,
  NotificationEvent,
  NotificationPreferenceItem,
  updateNotificationPreferences,
} from "@/lib/notifications-api";
import { ErrorBanner, SettingsPanel, StatusBadge } from "./notification-ui";

type PreferenceDraft = Record<string, boolean>;

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  EMAIL: "Email",
  IN_APP: "In-app",
  PUSH: "Push",
  SMS: "SMS",
};

export function NotificationPreferencesManager({
  canManage,
  events,
  globalSettings,
  preferences,
  sourceOfTruth,
}: {
  canManage: boolean;
  events: NotificationEvent[];
  globalSettings?: Record<string, unknown>;
  preferences: NotificationPreferenceItem[];
  sourceOfTruth?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<PreferenceDraft>(() =>
    buildDraft(events, preferences),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const rows = useMemo(
    () =>
      events.map((event) => ({
        event,
        channels: event.supportedChannels,
      })),
    [events],
  );

  function getKey(eventCode: string, channel: NotificationChannel) {
    return `${eventCode}:${channel}`;
  }

  function setEnabled(
    eventCode: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    setDraft((current) => ({
      ...current,
      [getKey(eventCode, channel)]: enabled,
    }));
  }

  async function save() {
    setError(null);
    setIsSaving(true);
    try {
      await updateNotificationPreferences(
        rows.flatMap(({ event, channels }) =>
          channels.map((channel) => ({
            eventCode: event.code,
            channel,
            enabled: draft[getKey(event.code, channel)] ?? false,
          })),
        ),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <SettingsPanel
        title="Global Notification Toggles"
        description="These lightweight tenant settings are read from the existing tenant settings API. Event-level preferences below decide which events can use each channel."
      >
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["inAppEnabled", "In-app"],
            ["emailEnabled", "Email"],
            ["browserPushEnabled", "Browser Push"],
            ["digestEnabled", "Digests"],
          ].map(([key, label]) => (
            <div
              className="rounded-2xl border border-border bg-white p-4"
              key={key}
            >
              <div className="text-sm font-semibold text-foreground">
                {label}
              </div>
              <div className="mt-2">
                <StatusBadge
                  status={globalSettings?.[key] === false ? "DISABLED" : "ACTIVE"}
                />
              </div>
            </div>
          ))}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Notification Event Preferences"
        description="Tenant-wide event and channel preferences. Global on/off toggles continue to live in tenant settings; these rows control event-level behavior."
      >
        {sourceOfTruth ? (
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Source: {sourceOfTruth}
          </p>
        ) : null}

        <ErrorBanner message={error} />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted">
                <th className="border-b border-border px-3 py-3">Event</th>
                <th className="border-b border-border px-3 py-3">Category</th>
                <th className="border-b border-border px-3 py-3">Default</th>
                <th className="border-b border-border px-3 py-3">Channels</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event, channels }) => (
                <tr key={event.code} className="align-top">
                  <td className="border-b border-border px-3 py-4">
                    <div className="font-semibold text-foreground">
                      {event.name}
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted">
                      {event.code}
                    </div>
                    {event.description ? (
                      <p className="mt-2 max-w-lg text-xs leading-5 text-muted">
                        {event.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="border-b border-border px-3 py-4">
                    <StatusBadge status={event.category} />
                  </td>
                  <td className="border-b border-border px-3 py-4">
                    {event.enabledByDefault ? "Enabled" : "Disabled"}
                  </td>
                  <td className="border-b border-border px-3 py-4">
                    <div className="flex flex-wrap gap-3">
                      {channels.map((channel) => {
                        const key = getKey(event.code, channel);
                        return (
                          <label
                            key={channel}
                            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2"
                          >
                            <input
                              checked={draft[key] ?? false}
                              className="h-4 w-4 rounded border-border"
                              disabled={!canManage || isSaving}
                              onChange={(input) =>
                                setEnabled(
                                  event.code,
                                  channel,
                                  input.target.checked,
                                )
                              }
                              type="checkbox"
                            />
                            <span className="text-xs font-semibold text-foreground">
                              {CHANNEL_LABELS[channel] ?? channel}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            disabled={!canManage}
            loading={isSaving}
            loadingText="Saving..."
            onClick={save}
            type="button"
          >
            Save Preferences
          </Button>
        </div>
      </SettingsPanel>
    </div>
  );
}

function buildDraft(
  events: NotificationEvent[],
  preferences: NotificationPreferenceItem[],
) {
  const draft: PreferenceDraft = {};
  const preferenceMap = new Map(
    preferences.map((preference) => [
      `${preference.eventCode}:${preference.channel}`,
      preference.enabled,
    ]),
  );

  for (const event of events) {
    for (const channel of event.supportedChannels) {
      draft[`${event.code}:${channel}`] =
        preferenceMap.get(`${event.code}:${channel}`) ??
        event.enabledByDefault;
    }
  }

  return draft;
}
