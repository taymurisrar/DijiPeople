import type { NotificationEventSetting } from "@/lib/notifications-api";

import {
  buildEventChannelPayload,
  createEventToggleState,
  groupNotificationEvents,
  runOptimisticToggle,
  SAVE_FAILED_MESSAGE,
  toggleKey,
  type EventToggleState,
} from "./notification-events-model";

/**
 * ITEM-0180 — the notification events page.
 *
 * The page replaced two ~53-row tables and a single Save button at the bottom
 * with one grouped list whose checkboxes save on change. What can go wrong is
 * here rather than in the markup: which events and channels are shown, how
 * search narrows them, and above all what happens to a checkbox whose save
 * fails. An optimistic value left on screen after a failed save is the page
 * telling the administrator something false about what will be sent.
 */

function event(
  overrides: Partial<NotificationEventSetting> & { eventCode: string },
): NotificationEventSetting {
  return {
    name: overrides.eventCode,
    moduleKey: "leave",
    moduleLabel: "Leave",
    required: false,
    channels: [{ channel: "IN_APP", enabled: true }],
    ...overrides,
  };
}

const ITEMS: NotificationEventSetting[] = [
  event({
    eventCode: "leave.request.submitted.approver",
    name: "Leave request submitted for approver",
  }),
  event({
    eventCode: "leave.request.approved.employee",
    name: "Leave request approved for employee",
  }),
  event({
    eventCode: "PAYSLIP_AVAILABLE",
    name: "Payslip available",
    moduleKey: "payroll",
    moduleLabel: "Payroll",
    channels: [
      { channel: "IN_APP", enabled: true },
      { channel: "EMAIL", enabled: false },
    ],
  }),
  event({
    eventCode: "AUTH_PASSWORD_RESET",
    name: "Password reset",
    moduleKey: "account",
    moduleLabel: "Account",
    required: true,
    channels: [{ channel: "EMAIL", enabled: true }],
  }),
];

describe("groupNotificationEvents", () => {
  it("groups by module in the order the server sent, one row per event", () => {
    const groups = groupNotificationEvents(ITEMS);

    expect(groups.map((group) => group.label)).toEqual([
      "Leave",
      "Payroll",
      "Account",
    ]);
    expect(groups[0].events.map((item) => item.eventCode)).toEqual([
      "leave.request.submitted.approver",
      "leave.request.approved.employee",
    ]);
  });

  it("shows only In-app and Email, and drops an event left with neither", () => {
    const groups = groupNotificationEvents([
      event({
        eventCode: "X_WITH_PUSH",
        name: "Has push",
        channels: [
          // A channel with no sender — Browser Push — must never render.
          { channel: "PUSH" as "IN_APP", enabled: true },
          { channel: "EMAIL", enabled: true },
        ],
      }),
      event({
        eventCode: "X_PUSH_ONLY",
        name: "Push only",
        channels: [{ channel: "PUSH" as "IN_APP", enabled: true }],
      }),
      event({ eventCode: "X_NONE", name: "Nothing", channels: [] }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].events).toHaveLength(1);
    expect(groups[0].events[0].channels).toEqual([
      { channel: "EMAIL", enabled: true },
    ]);
  });

  it("filters by event name, case- and accent-insensitive, and drops empty groups", () => {
    const groups = groupNotificationEvents(ITEMS, "  PAYSLÍP ");

    expect(groups.map((group) => group.label)).toEqual(["Payroll"]);
    expect(groups[0].events.map((item) => item.eventCode)).toEqual([
      "PAYSLIP_AVAILABLE",
    ]);
  });

  it("does not match on the raw event code, which is not shown", () => {
    expect(groupNotificationEvents(ITEMS, "AUTH_PASSWORD")).toEqual([]);
  });

  it("returns no groups when nothing matches, so the page can show its empty state", () => {
    expect(groupNotificationEvents(ITEMS, "timesheet")).toEqual([]);
  });
});

describe("buildEventChannelPayload", () => {
  it("is exactly the body the API DTO accepts", () => {
    // Mirrored by notification-event-channel-dto-contract.spec.ts in
    // services/api, which runs this shape through the real ValidationPipe.
    expect(buildEventChannelPayload("EMAIL", false)).toEqual({
      channel: "EMAIL",
      enabled: false,
    });
  });
});

function harness(initial: NotificationEventSetting[]) {
  let state: EventToggleState = createEventToggleState(initial);
  const snapshots: EventToggleState[] = [];
  const update = (next: (current: EventToggleState) => EventToggleState) => {
    state = next(state);
    snapshots.push(state);
  };
  return { update, snapshots, current: () => state };
}

function channelValue(
  state: EventToggleState,
  eventCode: string,
  channel: "IN_APP" | "EMAIL",
) {
  return state.items
    .find((item) => item.eventCode === eventCode)
    ?.channels.find((entry) => entry.channel === channel)?.enabled;
}

describe("runOptimisticToggle", () => {
  it("shows the new value immediately, marks it pending, then takes the server's answer", async () => {
    const { update, snapshots, current } = harness(ITEMS);
    const save = jest.fn(async () =>
      event({
        eventCode: "PAYSLIP_AVAILABLE",
        name: "Payslip available",
        moduleKey: "payroll",
        moduleLabel: "Payroll",
        channels: [
          { channel: "IN_APP", enabled: true },
          { channel: "EMAIL", enabled: true },
        ],
      }),
    );

    const ok = await runOptimisticToggle({
      eventCode: "PAYSLIP_AVAILABLE",
      channel: "EMAIL",
      enabled: true,
      update,
      save,
    });

    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledWith("PAYSLIP_AVAILABLE", {
      channel: "EMAIL",
      enabled: true,
    });
    // The optimistic frame: new value on screen before the server answered.
    expect(channelValue(snapshots[0], "PAYSLIP_AVAILABLE", "EMAIL")).toBe(true);
    expect(snapshots[0].pending[toggleKey("PAYSLIP_AVAILABLE", "EMAIL")]).toBe(
      true,
    );
    expect(channelValue(current(), "PAYSLIP_AVAILABLE", "EMAIL")).toBe(true);
    expect(current().pending).toEqual({});
    expect(current().errors).toEqual({});
  });

  it("puts the old value back and says so beside the checkbox when the save fails", async () => {
    const { update, current } = harness(ITEMS);

    const ok = await runOptimisticToggle({
      eventCode: "PAYSLIP_AVAILABLE",
      channel: "EMAIL",
      enabled: true,
      update,
      save: async () => {
        throw new Error("This notification is required or not yet available.");
      },
    });

    const key = toggleKey("PAYSLIP_AVAILABLE", "EMAIL");
    expect(ok).toBe(false);
    expect(channelValue(current(), "PAYSLIP_AVAILABLE", "EMAIL")).toBe(false);
    expect(current().pending).toEqual({});
    expect(current().errors[key]).toBe(
      "This notification is required or not yet available.",
    );
  });

  it("falls back to a plain message when the failure carries none", async () => {
    const { update, current } = harness(ITEMS);

    await runOptimisticToggle({
      eventCode: "leave.request.approved.employee",
      channel: "IN_APP",
      enabled: false,
      update,
      save: () => Promise.reject(new Error("")),
    });

    expect(
      current().errors[toggleKey("leave.request.approved.employee", "IN_APP")],
    ).toBe(SAVE_FAILED_MESSAGE);
    expect(
      channelValue(current(), "leave.request.approved.employee", "IN_APP"),
    ).toBe(true);
  });

  it("rolls back only its own checkbox, not one that saved while it was pending", async () => {
    const { update, current } = harness(ITEMS);

    let rejectEmail: (reason: Error) => void = () => undefined;
    const emailSave = runOptimisticToggle({
      eventCode: "PAYSLIP_AVAILABLE",
      channel: "EMAIL",
      enabled: true,
      update,
      save: () =>
        new Promise((_resolve, reject) => {
          rejectEmail = reject;
        }),
    });

    await runOptimisticToggle({
      eventCode: "leave.request.submitted.approver",
      channel: "IN_APP",
      enabled: false,
      update,
      save: async () =>
        event({
          eventCode: "leave.request.submitted.approver",
          name: "Leave request submitted for approver",
          channels: [{ channel: "IN_APP", enabled: false }],
        }),
    });

    rejectEmail(new Error("Network error"));
    await emailSave;

    expect(channelValue(current(), "PAYSLIP_AVAILABLE", "EMAIL")).toBe(false);
    expect(
      channelValue(current(), "leave.request.submitted.approver", "IN_APP"),
    ).toBe(false);
    expect(Object.keys(current().errors)).toEqual([
      toggleKey("PAYSLIP_AVAILABLE", "EMAIL"),
    ]);
  });

  it("keeps another pending channel's on-screen value when this event's save returns first", async () => {
    const { update, current } = harness(ITEMS);

    let resolveEmail: (value: NotificationEventSetting) => void = () =>
      undefined;
    const emailSave = runOptimisticToggle({
      eventCode: "PAYSLIP_AVAILABLE",
      channel: "EMAIL",
      enabled: true,
      update,
      save: () =>
        new Promise((resolve) => {
          resolveEmail = resolve;
        }),
    });

    // The In-app save answers with a snapshot taken before the Email write.
    await runOptimisticToggle({
      eventCode: "PAYSLIP_AVAILABLE",
      channel: "IN_APP",
      enabled: false,
      update,
      save: async () =>
        event({
          eventCode: "PAYSLIP_AVAILABLE",
          name: "Payslip available",
          moduleKey: "payroll",
          moduleLabel: "Payroll",
          channels: [
            { channel: "IN_APP", enabled: false },
            { channel: "EMAIL", enabled: false },
          ],
        }),
    });

    expect(channelValue(current(), "PAYSLIP_AVAILABLE", "EMAIL")).toBe(true);

    resolveEmail(
      event({
        eventCode: "PAYSLIP_AVAILABLE",
        name: "Payslip available",
        moduleKey: "payroll",
        moduleLabel: "Payroll",
        channels: [
          { channel: "IN_APP", enabled: false },
          { channel: "EMAIL", enabled: true },
        ],
      }),
    );
    await emailSave;

    expect(channelValue(current(), "PAYSLIP_AVAILABLE", "EMAIL")).toBe(true);
    expect(channelValue(current(), "PAYSLIP_AVAILABLE", "IN_APP")).toBe(false);
  });
});
