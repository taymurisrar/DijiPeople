import type {
  NotificationEventSetting,
  NotificationEventSettingChannel,
} from "@/lib/notifications-api";

/*
 * ITEM-0180. The logic behind the notification events page, kept out of the
 * component so it can be tested: this app's jest runs in node with no jsdom
 * (apps/web/AGENTS.md), and grouping, search and the optimistic save are where
 * this page can actually be wrong.
 */

export const EVENT_CHANNEL_ORDER: readonly NotificationEventSettingChannel[] = [
  "IN_APP",
  "EMAIL",
];

export const EVENT_CHANNEL_LABELS: Record<
  NotificationEventSettingChannel,
  string
> = {
  IN_APP: "In-app",
  EMAIL: "Email",
};

export const SAVE_FAILED_MESSAGE = "Couldn't save. Try again.";

export type NotificationEventGroup = {
  moduleKey: string;
  label: string;
  events: NotificationEventSetting[];
};

/*
 * Only In-app and Email exist. Browser Push and Digests have no sender, so a
 * channel the server might one day return under another name is dropped here
 * rather than rendered as a toggle wired to nothing.
 */
function isShownChannel(
  channel: string,
): channel is NotificationEventSettingChannel {
  return channel === "IN_APP" || channel === "EMAIL";
}

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/*
 * Groups in the order the server sent them (module order, then catalog
 * order), filtered by event name. A group with no matching event is dropped
 * rather than rendered as an empty heading.
 */
export function groupNotificationEvents(
  items: readonly NotificationEventSetting[],
  query = "",
): NotificationEventGroup[] {
  const needle = normalizeSearchText(query);
  const groups: NotificationEventGroup[] = [];
  const byModule = new Map<string, NotificationEventGroup>();

  for (const item of items) {
    const channels = item.channels.filter((entry) =>
      isShownChannel(String(entry.channel)),
    );
    if (!channels.length) continue;
    if (needle && !normalizeSearchText(item.name).includes(needle)) continue;

    let group = byModule.get(item.moduleKey);
    if (!group) {
      group = { moduleKey: item.moduleKey, label: item.moduleLabel, events: [] };
      byModule.set(item.moduleKey, group);
      groups.push(group);
    }
    group.events.push({ ...item, channels });
  }

  return groups;
}

/*
 * The exact body PATCH /notifications/event-settings/:code receives.
 * `notification-event-channel-dto-contract.spec.ts` in services/api runs this
 * shape through the real DTO under forbidNonWhitelisted — add a field here and
 * that spec is where it fails, not production.
 */
export function buildEventChannelPayload(
  channel: NotificationEventSettingChannel,
  enabled: boolean,
) {
  return { channel, enabled };
}

export type EventChannelPayload = ReturnType<typeof buildEventChannelPayload>;

export function toggleKey(
  eventCode: string,
  channel: NotificationEventSettingChannel,
) {
  return `${eventCode}::${channel}`;
}

export type EventToggleState = {
  items: NotificationEventSetting[];
  pending: Record<string, true>;
  errors: Record<string, string>;
};

export function createEventToggleState(
  items: NotificationEventSetting[],
): EventToggleState {
  return { items, pending: {}, errors: {} };
}

export function applyChannelValue(
  items: readonly NotificationEventSetting[],
  eventCode: string,
  channel: NotificationEventSettingChannel,
  enabled: boolean,
): NotificationEventSetting[] {
  return items.map((item) =>
    item.eventCode !== eventCode
      ? item
      : {
          ...item,
          channels: item.channels.map((entry) =>
            entry.channel === channel ? { ...entry, enabled } : entry,
          ),
        },
  );
}

/*
 * Takes the server's answer for one event, except for any other channel of
 * that event whose own save is still in flight: its response is the newer
 * truth for that channel, and overwriting it with this one would flicker it
 * back to a value the administrator has already changed.
 */
export function mergeSavedEvent(
  items: readonly NotificationEventSetting[],
  saved: NotificationEventSetting,
  pending: Record<string, true>,
): NotificationEventSetting[] {
  return items.map((item) => {
    if (item.eventCode !== saved.eventCode) return item;
    return {
      ...saved,
      channels: saved.channels.map((entry) => {
        if (!pending[toggleKey(saved.eventCode, entry.channel)]) return entry;
        const current = item.channels.find(
          (candidate) => candidate.channel === entry.channel,
        );
        return current ? { ...entry, enabled: current.enabled } : entry;
      }),
    };
  });
}

function without<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/*
 * Optimistic update, one toggle at a time: show the new value and mark it
 * pending; on success take the server's value; on failure put back only this
 * toggle's previous value and say so beside it. A failure never touches
 * another toggle, including one saved successfully while this one was pending.
 */
export async function runOptimisticToggle(input: {
  eventCode: string;
  channel: NotificationEventSettingChannel;
  enabled: boolean;
  update: (next: (state: EventToggleState) => EventToggleState) => void;
  save: (
    eventCode: string,
    payload: EventChannelPayload,
  ) => Promise<NotificationEventSetting>;
}): Promise<boolean> {
  const key = toggleKey(input.eventCode, input.channel);

  input.update((state) => ({
    items: applyChannelValue(
      state.items,
      input.eventCode,
      input.channel,
      input.enabled,
    ),
    pending: { ...state.pending, [key]: true },
    errors: without(state.errors, key),
  }));

  try {
    const saved = await input.save(
      input.eventCode,
      buildEventChannelPayload(input.channel, input.enabled),
    );
    input.update((state) => {
      const pending = without(state.pending, key);
      return {
        ...state,
        items: mergeSavedEvent(state.items, saved, pending),
        pending,
      };
    });
    return true;
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : SAVE_FAILED_MESSAGE;
    input.update((state) => ({
      items: applyChannelValue(
        state.items,
        input.eventCode,
        input.channel,
        !input.enabled,
      ),
      pending: without(state.pending, key),
      errors: { ...state.errors, [key]: message },
    }));
    return false;
  }
}
