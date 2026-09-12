"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  NotificationChannel,
  NotificationEvent,
  NotificationPreferenceItem,
  NotificationRuleItem,
  NotificationRuleStatus,
  updateNotificationPreferences,
  updateNotificationRule,
} from "@/lib/notifications-api";
import { ErrorBanner, SettingsPanel, StatusBadge } from "./notification-ui";
import { StatusPill } from "@/app/components/ui/status-pill";

type PreferenceDraft = Record<string, boolean>;

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  EMAIL: "Email",
  IN_APP: "In-app",
  PUSH: "Push",
  SMS: "SMS",
};

/*
 * BUG-3375. The whole point of this screen: an event with no rule must not
 * look like an event that works. "Not configured" and "Not yet available"
 * both render distinctly from "Enabled" — neither is a shade of green.
 */
const RULE_STATUS_LABEL: Record<NotificationRuleStatus, string> = {
  NOT_CONFIGURED: "Not configured",
  ENABLED: "Enabled",
  DISABLED: "Disabled",
  ALWAYS_ON: "Required — always on",
  NOT_YET_AVAILABLE: "Not yet available",
};

const RULE_STATUS_TONE: Record<
  NotificationRuleStatus,
  "good" | "muted" | "warning" | "danger" | "neutral" | "info"
> = {
  NOT_CONFIGURED: "warning",
  ENABLED: "good",
  DISABLED: "muted",
  ALWAYS_ON: "info",
  NOT_YET_AVAILABLE: "muted",
};

/*
 * BUG-3375 / ITEM-0169. Renders BOTH the models this screen previously
 * conflated: `NotificationRule` (does the event fire at all — the "Rule"
 * column) and `NotificationPreference` (which channels a tenant wants for an
 * event that does fire — the checkbox grid). One screen, two clearly labelled
 * sections, so the page title, this component's section headings and the
 * settings navigation entry all agree on what is being managed.
 */
export function NotificationRulesManager({
  canManagePreferences,
  canManageRules,
  events,
  globalSettings,
  preferences,
  rules,
}: {
  canManagePreferences: boolean;
  canManageRules: boolean;
  events: NotificationEvent[];
  globalSettings?: Record<string, unknown>;
  preferences: NotificationPreferenceItem[];
  rules: NotificationRuleItem[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<PreferenceDraft>(() =>
    buildDraft(events, preferences),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyRuleCode, setBusyRuleCode] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const rulesByCode = useMemo(
    () => new Map(rules.map((rule) => [rule.eventCode, rule])),
    [rules],
  );
  const preferenceMetaByCode = useMemo(
    () =>
      new Map(preferences.map((preference) => [preference.eventCode, preference])),
    [preferences],
  );

  const rows = useMemo(
    () =>
      events
        .filter((event) => rulesByCode.has(event.code))
        .map((event) => ({
          event,
          channels: event.supportedChannels,
          rule: rulesByCode.get(event.code) ?? null,
        })),
    [events, rulesByCode],
  );

  function getKey(eventCode: string, channel: NotificationChannel) {
    return `${eventCode}:${channel}`;
  }

  function isEventEditable(eventCode: string) {
    const meta = preferenceMetaByCode.get(eventCode);
    return meta ? meta.configurable && meta.availability === "ACTIVE" : true;
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
        rows
          .filter(({ event }) => isEventEditable(event.code))
          .flatMap(({ event, channels }) =>
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

  async function toggleRule(rule: NotificationRuleItem) {
    if (!rule.ruleId) return;
    setRuleError(null);
    setBusyRuleCode(rule.eventCode);
    try {
      await updateNotificationRule(rule.ruleId, { enabled: !(rule.ruleStatus === "ENABLED") });
      router.refresh();
    } catch (err) {
      setRuleError(
        err instanceof Error ? err.message : "Unable to update this rule.",
      );
    } finally {
      setBusyRuleCode(null);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        description="No notification events are configured for this workspace yet."
        title="No notification rules"
      />
    );
  }

  return (
    <div className="grid gap-6">
      <SettingsPanel
        description="Tenant-wide switches for each delivery channel. Turning a channel off here stops every event from using it, regardless of its own rule or preference below."
        title="Notification Channels"
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
        description="Whether each event can notify anyone at all. An event with no rule configured cannot fire — enabling it here, or asking an administrator to configure one, is required before its channel preferences below take effect."
        title="Notification Rules"
      >
        <ErrorBanner message={ruleError} />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted">
                <th className="border-b border-border px-3 py-3" scope="col">
                  Event
                </th>
                <th className="border-b border-border px-3 py-3" scope="col">
                  Category
                </th>
                <th className="border-b border-border px-3 py-3" scope="col">
                  Rule
                </th>
                <th className="border-b border-border px-3 py-3" scope="col">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event, rule }) => (
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
                    <StatusPill tone={RULE_STATUS_TONE[rule?.ruleStatus ?? "NOT_CONFIGURED"]}>
                      {RULE_STATUS_LABEL[rule?.ruleStatus ?? "NOT_CONFIGURED"]}
                    </StatusPill>
                  </td>
                  <td className="border-b border-border px-3 py-4">
                    {rule &&
                    rule.ruleId &&
                    (rule.ruleStatus === "ENABLED" ||
                      rule.ruleStatus === "DISABLED") ? (
                      <Button
                        disabled={!canManageRules || busyRuleCode === event.code}
                        loading={busyRuleCode === event.code}
                        loadingText="Saving..."
                        onClick={() => toggleRule(rule)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {rule.ruleStatus === "ENABLED" ? "Disable" : "Enable"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">
                        {rule?.ruleStatus === "ALWAYS_ON"
                          ? "Cannot be turned off"
                          : rule?.ruleStatus === "NOT_YET_AVAILABLE"
                            ? "No trigger implemented yet"
                            : "No rule exists for this tenant"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsPanel>

      <SettingsPanel
        description="For an event whose rule is enabled, choose which channels it uses. A channel switched off here never sends, even when the rule and the channel above both allow it."
        title="Channel Preferences"
      >
        <ErrorBanner message={error} />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted">
                <th className="border-b border-border px-3 py-3" scope="col">
                  Event
                </th>
                <th className="border-b border-border px-3 py-3" scope="col">
                  Category
                </th>
                <th className="border-b border-border px-3 py-3" scope="col">
                  Channels
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event, channels }) => {
                const editable = isEventEditable(event.code);
                return (
                  <tr key={event.code} className="align-top">
                    <td className="border-b border-border px-3 py-4">
                      <div className="font-semibold text-foreground">
                        {event.name}
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted">
                        {event.code}
                      </div>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <StatusBadge status={event.category} />
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      {editable ? (
                        <fieldset className="flex flex-wrap gap-3">
                          <legend className="sr-only">
                            Channels for {event.name}
                          </legend>
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
                                  disabled={!canManagePreferences || isSaving}
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
                        </fieldset>
                      ) : (
                        <span className="text-xs text-muted">
                          {preferenceMetaByCode.get(event.code)?.configurable ===
                          false
                            ? "Required — not configurable"
                            : "Not yet available"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            disabled={!canManagePreferences}
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
