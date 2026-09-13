import { getSettingsAdapter } from "./settings-adapter-registry";
import {
  DELIVERY_LOG_ITEM_KEY,
  IN_APP_DELIVERY_LOG_ADAPTER_KEY,
  deliveryLogAdapterKey,
  deliveryLogChannelHref,
  resolveDeliveryLogChannel,
} from "./delivery-log-channel";
import { getSettingsItemByKey } from "./settings-navigation";
import { getSettingsRuntimeItem } from "./settings-runtime";

/*
 * ITEM-0182 — the Delivery Logs screen.
 *
 * Walkthrough, 2026-09-13: the screen went by "Email Delivery Logs" (nav),
 * "Email Logs" (short label) and "Delivery Logs" (page title); its not-delivered
 * rows had no reason in the list; every row had a checkbox with no bulk action;
 * and in-app notifications had no log at all. The Notifications card opened a
 * page titled "Notification Rules".
 */

describe("delivery log channel", () => {
  it("defaults to email and recognises only an explicit in-app", () => {
    expect(resolveDeliveryLogChannel(undefined)).toBe("email");
    expect(resolveDeliveryLogChannel("email")).toBe("email");
    expect(resolveDeliveryLogChannel("sms")).toBe("email");
    expect(resolveDeliveryLogChannel("in-app")).toBe("in-app");
    expect(resolveDeliveryLogChannel(["in-app", "email"])).toBe("in-app");
  });

  it("serves each channel from its own adapter", () => {
    expect(deliveryLogAdapterKey("email")).toBe(DELIVERY_LOG_ITEM_KEY);
    expect(deliveryLogAdapterKey("in-app")).toBe(
      IN_APP_DELIVERY_LOG_ADAPTER_KEY,
    );
  });

  it("switches channel back to page one", () => {
    const path = "/settings/notifications/delivery/delivery-logs";
    expect(deliveryLogChannelHref(path, "in-app")).toBe(
      `${path}?channel=in-app`,
    );
    expect(deliveryLogChannelHref(path, "email")).toBe(path);
  });
});

describe("delivery log adapters", () => {
  it("shows the reason for a failed or undelivered email as a column", () => {
    const adapter = getSettingsAdapter(DELIVERY_LOG_ITEM_KEY);
    const columns = adapter?.spec.views?.[0]?.columns ?? [];
    expect(columns).toContain("errorMessage");
    expect(columns.indexOf("errorMessage")).toBe(columns.indexOf("status") + 1);
  });

  it("lists in-app deliveries from the tenant endpoint, without record pages", () => {
    const adapter = getSettingsAdapter(IN_APP_DELIVERY_LOG_ADAPTER_KEY);
    expect(adapter).not.toBeNull();
    expect(adapter?.serverApiPath).toBe("/notifications/in-app-delivery-logs");
    expect(adapter?.mode).toBe("read-only");
    expect(adapter?.supportsServerPagination).toBe(true);
    expect(adapter?.spec.recordNavigation).toBe(false);
    expect(adapter?.spec.permissions?.read).toBe("notification.logs.read");
  });

  it("keeps record navigation for the email log, whose rows open Retry", () => {
    expect(
      getSettingsAdapter(DELIVERY_LOG_ITEM_KEY)?.spec.recordNavigation,
    ).toBe(true);
  });
});

describe("one name per notifications screen", () => {
  it("names the logs screen Delivery Logs everywhere it appears", () => {
    const navItem = getSettingsItemByKey(DELIVERY_LOG_ITEM_KEY);
    const runtimeItem = getSettingsRuntimeItem(
      "notifications",
      DELIVERY_LOG_ITEM_KEY,
    );

    expect(navItem?.label).toBe("Delivery Logs");
    expect(navItem && "shortLabel" in navItem ? navItem.shortLabel : undefined)
      .toBeUndefined();
    expect(runtimeItem?.label).toBe("Delivery Logs");
    expect(runtimeItem?.groupLabel).toBe("Delivery Logs");
    expect(getSettingsAdapter(DELIVERY_LOG_ITEM_KEY)?.spec.label).toBe(
      "Delivery Logs",
    );
    expect(
      getSettingsAdapter(IN_APP_DELIVERY_LOG_ADAPTER_KEY)?.spec.label,
    ).toBe("Delivery Logs");
  });

  it("names the Notifications card after the page it opens", () => {
    const navItem = getSettingsItemByKey("notifications");
    const runtimeItem = getSettingsRuntimeItem("notifications", "notifications");

    expect(navItem?.label).toBe(getSettingsAdapter("notifications")?.spec.label);
    expect(runtimeItem?.groupLabel).toBe(navItem?.label);
  });
});
