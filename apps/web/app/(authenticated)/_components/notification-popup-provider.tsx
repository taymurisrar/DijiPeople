"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SideToast } from "@/app/components/notifications";
import {
  getInAppNotifications,
  isAuthFailure,
  markInAppNotificationPopupShown,
  openInboxNotification,
  type InAppNotificationItem,
} from "@/lib/notifications-api";

export function NotificationPopupProvider() {
  const router = useRouter();
  const [item, setItem] = useState<InAppNotificationItem | null>(null);
  /*
   * The second of the two 60-second pollers on every authenticated page. It
   * swallowed failures even more completely than the bell did — `.catch(() =>
   * null)` discards the reason — so it kept asking forever after the session
   * ended, and each refusal was written to the production error log as an
   * incident (BUG-2459).
   */
  const sessionEndedRef = useRef(false);

  const loadPopup = useCallback(async () => {
    if (sessionEndedRef.current) return;

    const result = await getInAppNotifications("pageSize=10").catch(
      (requestError: unknown) => {
        if (isAuthFailure(requestError)) sessionEndedRef.current = true;
        return null;
      },
    );
    const next = result?.items.find(shouldShowPopup) ?? null;
    if (!next) return;

    setItem(next);
    await markInAppNotificationPopupShown(next.id).catch(() => null);
  }, []);

  useEffect(() => {
    // Polling intentionally hydrates popup state from the external notifications API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPopup();
    const intervalId = window.setInterval(() => {
      if (sessionEndedRef.current) {
        window.clearInterval(intervalId);
        return;
      }
      void loadPopup();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [loadPopup]);

  const variant = useMemo<"success" | "error" | "warning" | "info">(() => {
    if (!item) return "info";
    if (item.notification.type === "ERROR") return "error";
    if (item.notification.type === "SUCCESS") return "success";
    if (
      item.notification.type === "ACTION_REQUIRED" ||
      item.notification.type === "APPROVAL_REQUIRED" ||
      item.notification.priority <= 2
    ) {
      return "warning";
    }
    return "info";
  }, [item]);

  async function openRecord() {
    if (!item) return;
    const result = await openInboxNotification(item.notification.id);
    setItem(null);
    if (result.state === "OK" && result.navigationTarget) {
      router.push(result.navigationTarget);
    }
  }

  return (
    <SideToast
      actionLabel={item?.notification.targetUrl ? "Open record" : undefined}
      autoCloseMs={8000}
      description={
        item?.notification.summary ?? item?.notification.body ?? undefined
      }
      isOpen={Boolean(item)}
      onAction={openRecord}
      onClose={() => setItem(null)}
      title={item?.notification.title ?? "Notification"}
      variant={variant}
    />
  );
}

function shouldShowPopup(item: InAppNotificationItem) {
  if (item.popupShownAt || item.archivedAt) return false;
  const metadata = item.notification.metadata;
  const displayMode =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).displayMode
      : null;

  return (
    displayMode === "POPUP_AND_BELL" ||
    item.notification.priority <= 2 ||
    item.notification.requiresAction ||
    item.notification.type === "ACTION_REQUIRED" ||
    item.notification.type === "APPROVAL_REQUIRED"
  );
}
