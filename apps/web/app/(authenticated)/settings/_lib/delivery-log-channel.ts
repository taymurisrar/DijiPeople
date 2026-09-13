/*
 * ITEM-0182 — which channel the Delivery Logs screen is showing.
 *
 * One screen, one name, two sources: email deliveries come from the
 * `notification-email-logs` adapter (the navigation item), in-app deliveries
 * from `notification-in-app-logs`. The channel is a query parameter rather than
 * a second settings item, so the page keeps a single URL and a single entry in
 * navigation. Kept here, free of React, so the choice can be tested.
 */

export const DELIVERY_LOG_ITEM_KEY = "notification-email-logs";
export const IN_APP_DELIVERY_LOG_ADAPTER_KEY = "notification-in-app-logs";

export type DeliveryLogChannel = "email" | "in-app";

export const DELIVERY_LOG_CHANNEL_OPTIONS: ReadonlyArray<{
  readonly label: string;
  readonly value: DeliveryLogChannel;
}> = [
  { label: "Email", value: "email" },
  { label: "In-app", value: "in-app" },
];

/** Anything but an explicit `in-app` is the email log, the screen's default. */
export function resolveDeliveryLogChannel(
  value: string | string[] | undefined,
): DeliveryLogChannel {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "in-app" ? "in-app" : "email";
}

export function deliveryLogAdapterKey(channel: DeliveryLogChannel) {
  return channel === "in-app"
    ? IN_APP_DELIVERY_LOG_ADAPTER_KEY
    : DELIVERY_LOG_ITEM_KEY;
}

/*
 * Switching channel starts from page one: page 3 of the email log says nothing
 * about where the in-app log's rows are.
 */
export function deliveryLogChannelHref(
  pathname: string,
  channel: DeliveryLogChannel,
) {
  return channel === "in-app" ? `${pathname}?channel=in-app` : pathname;
}
