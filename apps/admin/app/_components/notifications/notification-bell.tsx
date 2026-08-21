"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";

/**
 * The bell, and a dot that means something.
 *
 * It previously rendered an unconditional red dot: hardcoded markup, counting
 * nothing, permanently on. An indicator that is always lit carries no
 * information, and worse, it teaches the person looking at it that indicators
 * in this console can be ignored — so the day something does need attention,
 * the channel for saying so has already been discredited.
 *
 * Now it shows the unread count from the same endpoint the notifications page
 * reads, and shows nothing at all when there is nothing to say.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(
        "/api/platform/events/notifications?limit=1",
        { signal },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { unreadCount?: number };
      setUnread(Math.max(0, Number(payload.unreadCount ?? 0)));
    } catch {
      /*
       * A badge that could not be fetched shows no badge. Rendering a dot on a
       * failed request would recreate exactly the defect this replaces.
       */
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    /*
     * One code path for the first read and every poll after it.
     *
     * The first read is scheduled rather than called in the effect body, which
     * is what `react-hooks/set-state-in-effect` asks for and is also the more
     * honest shape: "fetch now, then every five minutes" is one recurring
     * behaviour, not an initial load with a timer bolted beside it.
     *
     * Five minutes is slow enough to be invisible in load terms and fast enough
     * that a provisioning failure does not sit unannounced for a working day. A
     * socket for a single number would be more infrastructure than the number
     * is worth.
     */
    let timer = window.setTimeout(function tick() {
      void refresh(controller.signal);
      timer = window.setTimeout(tick, 5 * 60 * 1000);
    }, 0);

    /* The feed page tells the bell when the count has been cleared. */
    const onRead = () => setUnread(0);
    window.addEventListener("dijipeople:notifications-read", onRead);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("dijipeople:notifications-read", onRead);
    };
  }, [refresh]);

  const label =
    unread > 0
      ? `View notifications, ${unread} unread`
      : "View notifications, none unread";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
    >
      <Bell className="h-4 w-4" aria-hidden />
      {unread > 0 ? (
        /*
         * The count, not a dot. "3" and "40" are different mornings, and the
         * number is also what makes the indicator falsifiable — a dot cannot be
         * wrong, so nobody notices when it is.
         */
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
