"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellOff, CheckCheck, LoaderCircle, RefreshCw } from "lucide-react";

import {
  formatWhen,
  NOTIFICATIONS_ENDPOINT,
  NOTIFICATIONS_READ_ENDPOINT,
  NOTIFICATIONS_READ_EVENT,
  SEVERITY,
  type Feed,
} from "./notification-model";

/**
 * What has happened on this platform that somebody should look at.
 *
 * The page this replaces showed the signed-in operator their own email address
 * and a paragraph explaining that notification delivery was controlled
 * centrally — under a bell with a permanent red dot that was not counting
 * anything. That combination is worse than an empty page: the dot promised
 * information the screen did not have, so the only thing an operator could
 * learn was to stop trusting the dot.
 *
 * The feed is a projection of `PlatformEvent`, narrowed to events that need
 * attention. Deliberately not every event — see `platform-notifications.ts` for
 * why a complete feed would be a log viewer nobody reads.
 */
export function NotificationsFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${NOTIFICATIONS_ENDPOINT}?limit=50`, {
        signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to load notifications.");
      }
      setFeed(payload as Feed);
      setError(null);
    } catch (reason) {
      if ((reason as { name?: string }).name === "AbortError") return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    /*
     * The bell can clear the unread mark too. Without this the page keeps
     * showing rows badged "Unread" that the server no longer considers unread
     * — one state, two components, and the one you are looking at is wrong.
     */
    const onRead = () => void load();
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);

    return () => {
      controller.abort();
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    };
  }, [load]);

  async function markAllRead() {
    setMarking(true);
    try {
      await fetch(NOTIFICATIONS_READ_ENDPOINT, { method: "POST" });
      await load();
      /*
       * The badge is read from the same endpoint, so it has to be told the
       * count changed — otherwise the dot survives until the next full page
       * load, which is exactly the "dot that means nothing" this replaces.
       */
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT));
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading notifications…
      </section>
    );
  }

  if (error) {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"
      >
        {error}
      </section>
    );
  }

  const items = feed?.items ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Platform activity
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {feed?.unreadCount
              ? `${feed.unreadCount} unread of ${items.length} shown`
              : `${items.length} shown, none unread`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={marking || !feed?.unreadCount}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {marking ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
            )}
            Mark all read
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <BellOff className="mx-auto h-6 w-6 text-slate-400" aria-hidden />
          <p className="mt-3 text-base font-semibold text-slate-900">
            Nothing needs your attention
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">
            Provisioning, billing and delivery failures appear here. Routine
            activity stays in the event log rather than filling this page.
          </p>
          <Link
            href="/settings/monitoring/events"
            className="mt-4 inline-flex text-sm font-semibold text-[var(--admin-primary)] hover:underline"
          >
            Open the full event log
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const tone = SEVERITY[item.severity];
            const SeverityIcon = tone.icon;
            /*
             * A row is a link only when there is somewhere to go. Rendering an
             * anchor with no href would look clickable and do nothing, which is
             * the same broken promise as the badge this page replaces.
             */
            const rowClassName = `flex gap-3 px-5 py-4 transition ${
              item.href ? "hover:bg-slate-50" : ""
            } ${item.unread ? "bg-sky-50/40" : ""}`;
            const body = (
              <>
                <SeverityIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    {/* Tone carries text: the label states the severity for
                          anyone who cannot rely on the colour. */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.pill}`}
                    >
                      {tone.label}
                    </span>
                    {item.unread ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
                        Unread
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-700">
                    {item.detail}
                  </p>
                  {item.action ? (
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {item.action}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {formatWhen(item.occurredAt)}
                    {item.entityType ? ` · ${item.entityType}` : ""}
                  </p>
                </div>
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className={rowClassName}>
                    {body}
                  </Link>
                ) : (
                  <div className={rowClassName}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
