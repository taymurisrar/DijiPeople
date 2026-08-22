"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, BellOff, CheckCheck } from "lucide-react";

import {
  formatWhen,
  NOTIFICATIONS_ENDPOINT,
  NOTIFICATIONS_READ_ENDPOINT,
  NOTIFICATIONS_READ_EVENT,
  SEVERITY,
  type Feed,
} from "./notification-model";

/** How many rows the popover shows before deferring to the full page. */
const PREVIEW_LIMIT = 6;

/**
 * The bell: a count, and the last few things worth knowing.
 *
 * It previously rendered an unconditional red dot — hardcoded markup, counting
 * nothing, permanently on. An indicator that is always lit carries no
 * information, and worse, it teaches the person looking at it that indicators
 * in this console can be ignored, so the day something does need attention the
 * channel for saying so has already been discredited.
 *
 * Then it counted correctly but was only a link. Leaving whatever you were
 * doing to find out whether anything happened is a poor trade for six lines of
 * text, which is why the count and the content now arrive in one gesture: the
 * popover answers "anything?" in place, and hands off to `/notifications` for
 * anything longer than a glance.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [marking, setMarking] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  /**
   * One read serves both jobs.
   *
   * The poll asks for a single row because it only needs `unreadCount`; opening
   * the popover asks for `PREVIEW_LIMIT` and keeps the payload. Two endpoints
   * would give the badge and the list two chances to disagree about one number.
   */
  const read = useCallback(async (limit: number, signal?: AbortSignal) => {
    try {
      const response = await fetch(`${NOTIFICATIONS_ENDPOINT}?limit=${limit}`, {
        signal,
      });
      if (!response.ok) throw new Error("unavailable");
      const payload = (await response.json()) as Feed;
      setUnread(Math.max(0, Number(payload.unreadCount ?? 0)));
      setTruncated(Boolean(payload.scanTruncated));
      if (limit > 1) {
        setFeed(payload);
        setFailed(false);
      }
      return payload;
    } catch (reason) {
      if ((reason as { name?: string }).name === "AbortError") return null;
      /*
       * A badge that could not be fetched shows no badge — rendering a dot on a
       * failed request would recreate exactly the defect this replaces. An open
       * popover does say so: the person is looking straight at it, and an empty
       * panel would read as "nothing has happened".
       */
      if (limit > 1) setFailed(true);
      return null;
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
      void read(1, controller.signal);
      timer = window.setTimeout(tick, 5 * 60 * 1000);
    }, 0);

    /* The feed page tells the bell when the count has been cleared. */
    const onRead = () => setUnread(0);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    };
  }, [read]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape must not strand focus on a panel that no longer exists.
      buttonRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    /*
     * Refetched on every open rather than cached. The panel is small, the
     * question it answers is "what is true right now", and a stale list under a
     * live badge is the same broken promise as a dot that counts nothing.
     */
    setLoading(true);
    void read(PREVIEW_LIMIT).finally(() => setLoading(false));
  }

  async function markAllRead() {
    setMarking(true);
    try {
      await fetch(NOTIFICATIONS_READ_ENDPOINT, { method: "POST" });
      await read(PREVIEW_LIMIT);
      // The page listens too, so a feed open in another tab agrees with this.
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT));
    } finally {
      setMarking(false);
    }
  }

  const label =
    unread > 0
      ? `Notifications, ${unread} unread`
      : "Notifications, none unread";
  const items = feed?.items ?? [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 aria-expanded:bg-slate-100"
        onClick={toggle}
        ref={buttonRef}
        title={label}
        type="button"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 ? (
          /*
           * The count, not a dot. "3" and "40" are different mornings, and the
           * number is also what makes the indicator falsifiable — a dot cannot
           * be wrong, so nobody notices when it is.
           */
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 || truncated ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          aria-label="Notifications"
          /*
           * `z-20` — the page-popover layer. It reads as too low for something
           * drawn over the whole console, and is not: the topbar is
           * `relative z-30`, so this panel sits inside its stacking context and
           * clears every page element regardless. Claiming `z-30` here would
           * fail `z-layers.spec.ts`, which reserves the shell tier for the
           * three shell files.
           *
           * Right-aligned and capped against the viewport, because the bell
           * sits near the right edge and a fixed 24rem panel would hang off a
           * narrow screen.
           */
          className="absolute right-0 z-20 mt-2 flex max-h-[min(32rem,80vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Notifications
              </p>
              <p className="text-xs text-slate-500">
                {unread > 0 ? `${unread} unread` : "None unread"}
              </p>
            </div>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={marking || unread === 0}
              onClick={() => void markAllRead()}
              type="button"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Loading notifications…
              </p>
            ) : failed ? (
              <p
                className="px-4 py-8 text-center text-sm text-rose-700"
                role="alert"
              >
                Notifications could not be loaded.
              </p>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <BellOff
                  aria-hidden
                  className="mx-auto h-5 w-5 text-slate-400"
                />
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  Nothing needs your attention
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Provisioning, billing and delivery failures appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const tone = SEVERITY[item.severity];
                  const SeverityIcon = tone.icon;
                  const body = (
                    <>
                      <SeverityIcon
                        aria-hidden
                        className={`mt-0.5 h-4 w-4 shrink-0 ${tone.dot}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.title}
                        </p>
                        {/*
                          Two lines of detail, not the whole thing. The popover
                          is a glance; a paragraph belongs on the page, and the
                          footer below is how you get there.
                        */}
                        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-600">
                          {item.detail}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          {/* The severity in words: colour alone says nothing
                              to anybody who cannot see it. */}
                          <span className="font-semibold uppercase tracking-wide">
                            {tone.label}
                          </span>
                          <span aria-hidden>·</span>
                          {formatWhen(item.occurredAt)}
                          {item.unread ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-semibold text-sky-700">
                                Unread
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </>
                  );
                  /*
                   * A row is a link only when there is somewhere to go.
                   * Rendering an anchor with no href would look clickable and
                   * do nothing.
                   */
                  const rowClass = `flex gap-3 px-4 py-3 ${
                    item.href ? "transition hover:bg-slate-50" : ""
                  } ${item.unread ? "bg-sky-50/40" : ""}`;
                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link
                          className={rowClass}
                          href={item.href}
                          onClick={() => setOpen(false)}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={rowClass}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-200 p-2">
            <Link
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              href="/notifications"
              onClick={() => setOpen(false)}
            >
              View all notifications
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
