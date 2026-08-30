"use client";

import { useRouter } from "next/navigation";
import { Archive, Bell, Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  archiveInAppNotification,
  getInAppNotifications,
  getUnreadNotificationCount,
  isAuthFailure,
  markInAppNotificationRead,
  openInboxNotification,
  type InAppNotificationItem,
} from "@/lib/notifications-api";
import { formatDateTime } from "@/lib/formatting-context";
import { Button } from "@/app/components/ui/button";

export function NotificationBell({
  canReadInbox = false,
}: {
  canReadInbox?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<InAppNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [staleState, setStaleState] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /*
   * Set once the session is gone, and never unset. Guards both the interval
   * callback and `refresh` itself, because a click on the bell can race a tick
   * that has already been scheduled.
   */
  const sessionEndedRef = useRef(false);
  const router = useRouter();

  async function refresh(openPanel = false) {
    if (sessionEndedRef.current) return;
    try {
      setError(null);
      if (openPanel) setIsLoading(true);
      if (openPanel) {
        const listResult = await getInAppNotifications("pageSize=8");
        setItems(listResult.items);
        setIsLoading(false);
      }
      const countResult = await getUnreadNotificationCount();
      setUnreadCount(countResult.unreadCount);
    } catch (requestError) {
      /*
       * A 401 is not a transient display problem, and treating it as one is
       * what made this component the largest single source of rows in the
       * production error log: it polled every 60 seconds forever after the
       * session ended, and each refusal was recorded as an incident. Two
       * fingerprints alone carried 1,033 occurrences (BUG-2459).
       *
       * Stop asking, and say the true thing rather than surfacing the raw
       * "Session is no longer active." on a badge nobody can act on.
       */
      if (isAuthFailure(requestError)) {
        sessionEndedRef.current = true;
        setError("Your session has ended. Sign in again to see notifications.");
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load notifications.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const initialRefreshId = window.setTimeout(() => void refresh(false), 0);
    const intervalId = window.setInterval(() => {
      // Clearing here as well as in the teardown: the effect runs once, so
      // there is no re-render that would otherwise stop the timer.
      if (sessionEndedRef.current) {
        window.clearInterval(intervalId);
        return;
      }
      void refresh(false);
    }, 60_000);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function openNotifications() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) await refresh(true);
  }

  async function markRead(id: string) {
    await markInAppNotificationRead(id);
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
    setUnreadCount((current) => Math.max(0, current - 1));
  }

  async function archive(id: string) {
    await archiveInAppNotification(id);
    setItems((current) => current.filter((item) => item.id !== id));
    setUnreadCount((current) =>
      items.find((item) => item.id === id && !item.readAt)
        ? Math.max(0, current - 1)
        : current,
    );
  }

  async function openRelated(notificationId: string) {
    try {
      setStaleState(null);
      const result = await openInboxNotification(notificationId);
      if (result.state === "OK" && result.navigationTarget) {
        setIsOpen(false);
        router.push(result.navigationTarget);
        return;
      }
      setStaleState(readableOpenState(result.state));
      await refresh(true);
    } catch (requestError) {
      setStaleState(
        requestError instanceof Error
          ? requestError.message
          : "Unable to open notification.",
      );
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon-md"
        aria-expanded={isOpen}
        aria-label="Notifications"
        onClick={() => void openNotifications()}
        className="relative rounded-full border border-border bg-white/80 text-foreground hover:border-accent/30 hover:bg-white"
      >
        <Bell className="h-5 w-5" />

        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[11px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {isOpen ? (
        <div className="absolute right-0 z-30 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-[24px] border border-border bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between gap-3 px-2 py-1">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Notifications
              </p>
              <p className="text-xs text-muted">
                {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
              </p>
            </div>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            ) : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {staleState ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              {staleState}
            </div>
          ) : null}

          <div className="mt-3 grid max-h-96 gap-2 overflow-y-auto">
            {!isLoading && items.length === 0 ? (
              <div className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
                No notifications yet.
              </div>
            ) : null}

            {items.map((item) => (
              <article
                className="rounded-2xl border border-border/70 bg-white px-3 py-3"
                key={item.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.notification.title}
                    </p>
                    {item.notification.summary ?? item.notification.body ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {item.notification.summary ?? item.notification.body}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">
                      {formatRelativeDate(item.createdAt)}
                    </p>
                  </div>
                  {!item.readAt ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  ) : null}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {item.notification.targetUrl ? (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => void openRelated(item.notification.id)}
                    >
                      Open
                    </Button>
                  ) : null}
                  {!item.readAt ? (
                    <Button
                      variant="secondary"
                      size="xs"
                      leftIcon={<Check className="h-3.5 w-3.5" />}
                      onClick={() => void markRead(item.id)}
                    >
                      Read
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="xs"
                    leftIcon={<Archive className="h-3.5 w-3.5" />}
                    onClick={() => void archive(item.id)}
                  >
                    Archive
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {canReadInbox ? (
            <Button
              href="/inbox"
              variant="secondary"
              fullWidth
              className="mt-3"
              onClick={() => setIsOpen(false)}
            >
              Open Inbox
            </Button>
          ) : (
            <p className="mt-3 rounded-2xl border border-border bg-surface px-3 py-2 text-center text-sm font-medium text-muted">
              Inbox access unavailable
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatRelativeDate(value: string) {
  return formatDateTime(value);
}

function readableOpenState(state: string) {
  if (state === "ACCESS_DENIED") {
    return "You no longer have access to the related record.";
  }
  if (state === "RECORD_NOT_FOUND") {
    return "The related record is no longer available.";
  }
  if (state === "SUPERSEDED") {
    return "This notification has been superseded by a newer update.";
  }
  if (state === "EXPIRED") {
    return "This notification has expired.";
  }
  return "This notification can no longer be opened.";
}
