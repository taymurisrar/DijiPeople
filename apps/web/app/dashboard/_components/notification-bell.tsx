"use client";

import Link from "next/link";
import { Archive, Bell, Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  archiveInAppNotification,
  getInAppNotifications,
  getUnreadNotificationCount,
  markInAppNotificationRead,
  type InAppNotificationItem,
} from "@/lib/notifications-api";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<InAppNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function refresh(openPanel = false) {
    try {
      setError(null);
      if (openPanel) setIsLoading(true);
      const [countResult, listResult] = await Promise.all([
        getUnreadNotificationCount(),
        openPanel
          ? getInAppNotifications("pageSize=8")
          : Promise.resolve({ items }),
      ]);
      setUnreadCount(countResult.unreadCount);
      if (openPanel) setItems(listResult.items);
    } catch (requestError) {
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
    void refresh(false);
    const intervalId = window.setInterval(() => void refresh(false), 60_000);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-label="Notifications"
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white/80 text-foreground transition hover:border-accent/30 hover:bg-white"
        onClick={() => void openNotifications()}
        type="button"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[11px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

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
                    {item.notification.body ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {item.notification.body}
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
                    <Link
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                      href={item.notification.targetUrl}
                      onClick={() => setIsOpen(false)}
                    >
                      Open
                    </Link>
                  ) : null}
                  {!item.readAt ? (
                    <button
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                      onClick={() => void markRead(item.id)}
                      type="button"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Read
                    </button>
                  ) : null}
                  <button
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                    onClick={() => void archive(item.id)}
                    type="button"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
