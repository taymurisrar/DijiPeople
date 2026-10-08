"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  INCIDENT_PARAM,
  formatSourceApp,
  summarizeMessage,
  titleCase,
} from "@/lib/error-log-console";
import { SeverityBadge, SupportStatusBadge } from "./monitoring-ui";

/**
 * Monitoring, as a place to start work rather than a place to read numbers.
 *
 * Each band answers one question, in the order an operator asks them:
 *
 *   1. Is anything on fire?       — unresolved and critical counts, as links
 *   2. What should I pick up?     — the most recent unresolved incidents
 *   3. Is the platform itself ok? — event failure rate, by source
 *
 * WHAT WAS REMOVED. This page used to carry its own search, three filters and
 * a sort over the 25 newest incidents, filtered in the browser — a second,
 * weaker error log one tab away from the real one, whose severity and source
 * options ("CRITICAL", "WEB") matched values no row stores. The list here is
 * now a short read of what is open, and every row opens that incident in the
 * error log, where filtering is done properly on the server.
 */

export type OverviewIncident = {
  id: string;
  referenceNumber: string;
  timestamp: string;
  lastSeenAt?: string;
  severity: string;
  severityGroup?: string;
  sourceApp: string;
  status: string;
  message: string;
  module?: string | null;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  category: string | null;
  occurrenceCount?: number;
  tenant: { id: string; name: string | null } | null;
  user: { id: string | null; email: string | null } | null;
  assignedTo: string | null;
};

export type OverviewMetrics = {
  total: number;
  critical: number;
  open: number;
  resolved: number;
  /*
   * Counted by the API from the same predicates the error log's filters use.
   * Optional only so a stale API cannot blank the page.
   */
  criticalOpen?: number;
  warning?: number;
  investigating?: number;
};

export type EventHealth = {
  window: string;
  bySource: Record<string, number>;
  byResult: Record<string, number>;
};

const QUEUE = "/settings/monitoring/error-logs";

export function MonitoringOverview({
  incidents,
  metrics,
  events,
}: {
  incidents: OverviewIncident[];
  metrics: OverviewMetrics;
  events: EventHealth;
}) {
  const failed = events.byResult.FAILED ?? 0;
  const eventTotal = Object.values(events.byResult).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <div className="space-y-5">
      {/*
        Band 1. Every tile opens the error log with the filter that produced
        its count — the same predicate on both sides, so the number and the
        list cannot disagree (BUG-1750, BUG-2495). The critical tile used to
        show the all-time critical count while linking to critical-and-new.
      */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatLink
          hint="Error-level failures nobody has closed"
          href={`${QUEUE}?severity=critical&status=UNRESOLVED`}
          label="Critical, unresolved"
          tone={metrics.criticalOpen ? "danger" : "calm"}
          value={metrics.criticalOpen}
        />
        <StatLink
          hint="Not resolved or set aside"
          href={`${QUEUE}?status=UNRESOLVED`}
          label="Unresolved"
          tone={metrics.open ? "warning" : "calm"}
          value={metrics.open}
        />
        <StatLink
          hint="Closed by support"
          href={`${QUEUE}?status=RESOLVED`}
          label="Resolved"
          tone="calm"
          value={metrics.resolved}
        />
        <StatLink
          hint="Every incident on record"
          href={QUEUE}
          label="Recorded"
          tone="neutral"
          value={metrics.total}
        />
      </section>

      {/* Band 2 — the work itself. */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Latest unresolved incidents
            </h2>
            <p className="text-xs text-slate-500">
              The {incidents.length || ""} most recently active. Open one to
              investigate it.
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            href={`${QUEUE}?status=UNRESOLVED`}
          >
            Open the error log
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>

        {incidents.length ? (
          <ul className="divide-y divide-slate-100">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  className="grid gap-x-3 gap-y-1 px-4 py-2.5 transition hover:bg-slate-50 md:grid-cols-[auto_minmax(0,1fr)_auto]"
                  /*
                   * BUG-1419: this once composed a record route under the
                   * queue that has never existed. The incident opens in the
                   * error log's drawer instead, addressed by its reference.
                   */
                  href={`${QUEUE}?status=UNRESOLVED&${INCIDENT_PARAM}=${encodeURIComponent(incident.referenceNumber)}`}
                >
                  <span className="pt-0.5">
                    <SeverityBadge
                      group={incident.severityGroup}
                      severity={incident.severity}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-950">
                      {summarizeMessage(incident.message)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{incident.tenant?.name ?? "Platform"}</span>
                      <span>{formatSourceApp(incident.sourceApp)}</span>
                      {incident.module ? <span>{incident.module}</span> : null}
                      {incident.occurrenceCount &&
                      incident.occurrenceCount > 1 ? (
                        <span>
                          ×{incident.occurrenceCount.toLocaleString()}
                        </span>
                      ) : null}
                      <span className="font-mono">
                        {incident.referenceNumber}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3 md:justify-end">
                    <SupportStatusBadge value={incident.status} />
                    <IncidentTime
                      timestamp={incident.lastSeenAt ?? incident.timestamp}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-10 text-center">
            <CheckCircle2
              aria-hidden
              className="mx-auto h-6 w-6 text-emerald-500"
            />
            <p className="mt-2 text-sm font-semibold text-slate-900">
              No unresolved incidents.
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Failures from the tenant app, platform admin and API arrive in the
              error log as they happen.
            </p>
          </div>
        )}
      </section>

      {/*
        Band 3 — the platform's own signal. A spike in failed events explains
        a spike in incidents; the success count is the denominator, so it is
        shown as one.
      */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-950">
            Platform events
          </h2>
          <p className="text-xs text-slate-500">
            Last {events.window === "24h" ? "24 hours" : events.window}
          </p>
        </div>

        {eventTotal ? (
          <>
            <p className="mt-2 text-sm text-slate-700">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  failed ? "text-rose-700" : "text-slate-950"
                }`}
              >
                {failed.toLocaleString()}
              </span>{" "}
              failed of {eventTotal.toLocaleString()} recorded
              {events.byResult.PENDING
                ? `, ${events.byResult.PENDING.toLocaleString()} still pending`
                : ""}
              .
            </p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(events.bySource)
                .sort(([, left], [, right]) => right - left)
                .map(([source, count]) => (
                  <div
                    className="rounded-lg bg-slate-50 px-3 py-2"
                    key={source}
                  >
                    <dt className="text-xs text-slate-500">
                      {titleCase(source)}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums text-slate-900">
                      {count.toLocaleString()}
                    </dd>
                  </div>
                ))}
            </dl>
            <Link
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--admin-primary)] hover:underline"
              href="/settings/monitoring/events"
            >
              Browse the event log
              <ArrowRight aria-hidden className="h-3 w-3" />
            </Link>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            No platform events in the last 24 hours. Sign-ins, provisioning runs
            and billing webhooks all record here.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * A figure that is also the way to act on it. The meaning is in the label and
 * hint; `tone` is emphasis only.
 */
function StatLink({
  href,
  label,
  value,
  hint,
  tone,
}: {
  href: string;
  label: string;
  value: number | undefined;
  hint: string;
  tone: "danger" | "warning" | "calm" | "neutral";
}) {
  const accent = {
    danger: "bg-rose-500",
    warning: "bg-amber-500",
    calm: "bg-emerald-500",
    neutral: "bg-slate-400",
  }[tone];
  return (
    <Link
      className="relative block overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:shadow"
      href={href}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-950">
        {typeof value === "number" ? value.toLocaleString() : "—"}
      </span>
      <span className="block text-[11px] text-slate-500">{hint}</span>
    </Link>
  );
}

const subscribeNever = () => () => {};

/**
 * An incident's age, rendered only in the browser.
 *
 * "7m ago" depends on the clock and the tooltip on the viewer's locale, so the
 * server and the browser computed different text whenever a minute ticked
 * between render and hydration, and React's hydration error became a
 * full-screen "unexpected system error" over this page (TASK-0032 browser QA).
 * The server renders an empty `<time>` carrying only the machine-readable
 * timestamp, and the browser fills in the human text after hydration.
 */
function IncidentTime({ timestamp }: { timestamp: string }) {
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return (
    <time
      className="w-16 shrink-0 text-right text-xs text-slate-500"
      dateTime={timestamp}
      title={inBrowser ? new Date(timestamp).toLocaleString() : undefined}
    >
      {inBrowser ? relativeTime(timestamp) : null}
    </time>
  );
}

/** "4m ago", falling back to a date once relative stops helping. */
function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}
