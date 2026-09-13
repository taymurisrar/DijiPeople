"use client";

import { useId, useMemo, useState } from "react";
import { EmptyState } from "@/app/components/ui/empty-state";
import { CheckboxField, TextField } from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { INLINE_ERROR_HANDLING_HEADERS } from "@/lib/api-error";
import {
  updateNotificationEventChannel,
  type NotificationEventSetting,
  type NotificationEventSettingChannel,
} from "@/lib/notifications-api";
import { notifyTenantSettingsChanged } from "@/lib/settings-events";
import {
  createEventToggleState,
  EVENT_CHANNEL_LABELS,
  EVENT_CHANNEL_ORDER,
  groupNotificationEvents,
  runOptimisticToggle,
  SAVE_FAILED_MESSAGE,
  toggleKey,
  type EventToggleState,
} from "./notification-events-model";

/*
 * ITEM-0180. One plain list of the events this workspace can actually be
 * notified about, grouped by module, each channel a checkbox that saves the
 * moment it changes. What a checkbox writes, and why it is truthful to what
 * gets sent, is settled on the server (notification-event-delivery.ts,
 * EXECPLAN-0049); this component only shows it and saves it.
 */
export function NotificationEventsManager({
  canManageEmail,
  canManageEvents,
  emailEnabled: initialEmailEnabled,
  items,
}: {
  canManageEmail: boolean;
  canManageEvents: boolean;
  /* `null` when tenant settings could not be read: the switch is not shown
   * rather than shown in a state nobody knows is true. */
  emailEnabled: boolean | null;
  items: NotificationEventSetting[];
}) {
  const [state, setState] = useState<EventToggleState>(() =>
    createEventToggleState(items),
  );
  const [query, setQuery] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [emailPending, setEmailPending] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();

  const groups = useMemo(
    () => groupNotificationEvents(state.items, query),
    [state.items, query],
  );
  const hasEvents = useMemo(
    () => groupNotificationEvents(state.items).length > 0,
    [state.items],
  );

  function toggleChannel(
    eventCode: string,
    channel: NotificationEventSettingChannel,
    enabled: boolean,
  ) {
    void runOptimisticToggle({
      eventCode,
      channel,
      enabled,
      update: setState,
      save: updateNotificationEventChannel,
    });
  }

  async function toggleTenantEmail(next: boolean) {
    setEmailError(undefined);
    setEmailEnabled(next);
    setEmailPending(true);
    try {
      await saveTenantEmailEnabled(next);
      notifyTenantSettingsChanged(["notifications"]);
    } catch (error) {
      setEmailEnabled(!next);
      setEmailError(
        error instanceof Error && error.message
          ? error.message
          : SAVE_FAILED_MESSAGE,
      );
    } finally {
      setEmailPending(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3">
        <TextField
          className="min-w-0 flex-1 basis-56"
          label="Search events"
          onChange={setQuery}
          type="search"
          value={query}
        />
        {emailEnabled === null ? null : (
          <CheckboxField
            checked={emailEnabled}
            disabled={!canManageEmail || emailPending}
            error={emailError}
            label="Send email"
            onChange={(next) => void toggleTenantEmail(next)}
          />
        )}
      </div>

      {!hasEvents ? (
        <EmptyState
          description="There are no notification events to configure."
          title="No notification events"
        />
      ) : groups.length === 0 ? (
        <EmptyState
          description={`Nothing matches "${query.trim()}".`}
          title="No matching events"
        />
      ) : (
        groups.map((group) => (
          <SectionCard key={group.moduleKey} title={group.label}>
            <ul className="divide-y divide-border">
              {group.events.map((event) => (
                <NotificationEventRow
                  canManageEvents={canManageEvents}
                  emailBlocked={emailEnabled === false}
                  event={event}
                  key={event.eventCode}
                  onToggle={toggleChannel}
                  state={state}
                />
              ))}
            </ul>
          </SectionCard>
        ))
      )}
    </div>
  );
}

function NotificationEventRow({
  canManageEvents,
  emailBlocked,
  event,
  onToggle,
  state,
}: {
  canManageEvents: boolean;
  emailBlocked: boolean;
  event: NotificationEventSetting;
  onToggle: (
    eventCode: string,
    channel: NotificationEventSettingChannel,
    enabled: boolean,
  ) => void;
  state: EventToggleState;
}) {
  const nameId = `notification-event-${useId().replace(/:/g, "")}`;

  return (
    <li
      className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0"
      data-event-code={event.eventCode}
    >
      <span
        className="min-w-0 flex-1 basis-48 break-words text-sm font-medium text-foreground"
        id={nameId}
      >
        {event.name}
      </span>

      {event.required ? (
        <StatusPill tone="info">Always on</StatusPill>
      ) : (
        <div
          aria-labelledby={nameId}
          className="flex flex-wrap gap-x-6 gap-y-2"
          role="group"
        >
          {EVENT_CHANNEL_ORDER.map((channel) => {
            const entry = event.channels.find(
              (candidate) => candidate.channel === channel,
            );
            if (!entry) {
              // Keeps the In-app and Email columns aligned across rows on
              // wider screens; nothing is announced for a channel that
              // cannot carry this event.
              return (
                <span
                  aria-hidden="true"
                  className="hidden min-w-20 sm:block"
                  key={channel}
                />
              );
            }

            const key = toggleKey(event.eventCode, channel);
            return (
              <CheckboxField
                checked={entry.enabled}
                className="min-w-20"
                disabled={
                  !canManageEvents ||
                  Boolean(state.pending[key]) ||
                  (channel === "EMAIL" && emailBlocked)
                }
                error={state.errors[key]}
                key={channel}
                label={EVENT_CHANNEL_LABELS[channel]}
                onChange={(next) => onToggle(event.eventCode, channel, next)}
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

/*
 * The tenant-wide switch `EmailExecutionService.execute()` reads
 * (`notifications.emailEnabled`). There is no In-app, Browser Push or Digests
 * switch here: nothing on the server reads those three.
 */
async function saveTenantEmailEnabled(enabled: boolean) {
  const response = await fetch("/api/tenant-settings/notifications", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...INLINE_ERROR_HANDLING_HEADERS,
    },
    body: JSON.stringify({
      updates: [
        { category: "notifications", key: "emailEnabled", value: enabled },
      ],
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    throw new Error(
      typeof data?.message === "string" && data.message
        ? data.message
        : SAVE_FAILED_MESSAGE,
    );
  }
}
