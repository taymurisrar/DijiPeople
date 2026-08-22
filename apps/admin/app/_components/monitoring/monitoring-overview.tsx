"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  Inbox,
  ShieldAlert,
} from "lucide-react";

/**
 * Monitoring, as a place to start work rather than a place to read numbers.
 *
 * WHAT WAS HERE. Four counters (events / succeeded / pending / failed), a
 * two-column list of event codes by source, and ten recent events with their
 * timestamps. Every figure was real — and none of it told a support agent
 * anything they could act on. "Events (24h): 4,182" is not a question anybody
 * has; "which customer is broken right now, and what happened to them" is, and
 * that data was already on the wire from a different endpoint the page did not
 * call.
 *
 * So this is built from the incident queue rather than from the event stream.
 * Each band answers one question, in the order an agent asks them:
 *
 *   1. Is anything on fire?          — critical and untriaged counts, as links
 *   2. What should I pick up?        — the actual queue, filterable in place
 *   3. Is the platform itself well?  — event failure rate, by source
 *
 * Every tile is a link into the incident queue carrying its own filter, so
 * reading a number and acting on it are the same gesture. Nothing here is
 * decorative: there are no placeholder cards, no sparklines over data we do not
 * have, and no health tile for a thing this platform does not measure.
 */

export type OverviewIncident = {
  id: string;
  referenceNumber: string;
  timestamp: string;
  severity: string;
  sourceApp: string;
  status: string;
  message: string;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  category: string | null;
  tenant: { id: string; name: string | null } | null;
  user: { id: string | null; email: string | null } | null;
  assignedTo: string | null;
};

export type OverviewMetrics = {
  total: number;
  critical: number;
  webApp: number;
  open: number;
  resolved: number;
};

export type EventHealth = {
  window: string;
  bySource: Record<string, number>;
  byResult: Record<string, number>;
};

const QUEUE = "/settings/monitoring/error-logs";

/** The filters this page owns. They map one-for-one onto the queue's own. */
type Filters = {
  severity: string;
  sourceApp: string;
  status: string;
  search: string;
};

const EMPTY: Filters = { severity: "", sourceApp: "", status: "", search: "" };

type SortKey = "newest" | "oldest" | "severity";

export function MonitoringOverview({
  incidents,
  metrics,
  events,
}: {
  incidents: OverviewIncident[];
  metrics: OverviewMetrics;
  events: EventHealth;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<SortKey>("newest");
  const [copied, setCopied] = useState<string | null>(null);

  /*
   * Filtering and sorting happen here, over the page the server already sent.
   *
   * The alternative — a round trip per keystroke — would make this a second
   * incident queue, and there is one of those a click away that does it
   * properly with pagination. This is triage over the most recent slice: fast,
   * and honest about being a slice, which is what "Open in the full queue"
   * beneath it is for. It carries the same filters across, so narrowing here
   * and continuing there is one continuous action rather than two.
   */
  const visible = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    const rows = incidents.filter((incident) => {
      if (filters.severity && incident.severity !== filters.severity)
        return false;
      if (filters.sourceApp && incident.sourceApp !== filters.sourceApp)
        return false;
      if (filters.status && incident.status !== filters.status) return false;
      if (!needle) return true;
      return [
        incident.referenceNumber,
        incident.message,
        incident.route,
        incident.tenant?.name,
        incident.user?.email,
        incident.category,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });

    const rank = (value: string) =>
      ["CRITICAL", "ERROR", "WARNING", "INFO"].indexOf(value);
    return [...rows].sort((left, right) => {
      if (sort === "severity") {
        const bySeverity = rank(left.severity) - rank(right.severity);
        if (bySeverity !== 0) return bySeverity;
      }
      const leftTime = new Date(left.timestamp).getTime();
      const rightTime = new Date(right.timestamp).getTime();
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [incidents, filters, sort]);

  /** The same filters, as the query the full queue understands. */
  const queueHref = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.sourceApp) params.set("sourceApp", filters.sourceApp);
    if (filters.status) params.set("status", filters.status);
    if (filters.search.trim()) params.set("search", filters.search.trim());
    const query = params.toString();
    return query ? `${QUEUE}?${query}` : QUEUE;
  }, [filters]);

  const failed = events.byResult.FAILED ?? 0;
  const eventTotal = Object.values(events.byResult).reduce(
    (sum, count) => sum + count,
    0,
  );

  async function copyReference(reference: string) {
    await navigator.clipboard.writeText(reference);
    setCopied(reference);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-5">
      {/*
        Band 1 — is anything on fire.
        Four figures, each a link that applies its own filter. A count an agent
        has to go and rebuild a filter for is a count that costs them time to
        use.
      */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatLink
          href={`${QUEUE}?severity=CRITICAL&status=NEW`}
          icon={ShieldAlert}
          label="Critical, untriaged"
          tone={metrics.critical ? "danger" : "calm"}
          value={metrics.critical}
          hint="Nobody has picked these up"
        />
        <StatLink
          href={`${QUEUE}?status=NEW`}
          icon={Inbox}
          label="Waiting for triage"
          tone={metrics.open ? "warning" : "calm"}
          value={metrics.open}
          hint="No owner, no investigation yet"
        />
        <StatLink
          href={`${QUEUE}?status=INVESTIGATING`}
          icon={Clock3}
          label="Under investigation"
          tone="info"
          value={Math.max(metrics.total - metrics.open - metrics.resolved, 0)}
          hint="Assigned and in progress"
        />
        <StatLink
          href={`${QUEUE}?status=RESOLVED`}
          icon={CheckCircle2}
          label="Resolved"
          tone="calm"
          value={metrics.resolved}
          hint="Closed with a customer-ready update"
        />
      </section>

      {/*
        Band 2 — the work itself.
        A queue an agent can narrow without leaving the page, and carry into the
        full queue when they want pagination. The filters are the queue's own
        parameter names, so the two cannot drift into meaning different things.
      */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-950">
              Incidents to pick up
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              The most recent {incidents.length}, filtered here. Open the full
              queue for everything, with pagination and assignment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Search incidents"
              className="h-9 w-52 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-primary)]"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Reference, customer, route…"
              value={filters.search}
            />
            <Select
              label="Severity"
              onChange={(value) =>
                setFilters((current) => ({ ...current, severity: value }))
              }
              options={["CRITICAL", "ERROR", "WARNING", "INFO"]}
              value={filters.severity}
            />
            <Select
              label="Source"
              onChange={(value) =>
                setFilters((current) => ({ ...current, sourceApp: value }))
              }
              options={["WEB", "ADMIN", "API"]}
              value={filters.sourceApp}
            />
            <Select
              label="Status"
              onChange={(value) =>
                setFilters((current) => ({ ...current, status: value }))
              }
              options={[
                "NEW",
                "INVESTIGATING",
                "WAITING_ON_CUSTOMER",
                "RESOLVED",
              ]}
              value={filters.status}
            />
            <label className="sr-only" htmlFor="monitoring-overview-sort">
              Sort incidents
            </label>
            <select
              className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-900"
              id="monitoring-overview-sort"
              onChange={(event) => setSort(event.target.value as SortKey)}
              value={sort}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="severity">Most severe first</option>
            </select>
            {filters === EMPTY ? null : (
              <button
                className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => setFilters(EMPTY)}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {visible.length ? (
          <ul className="divide-y divide-slate-100">
            {visible.map((incident) => (
              <li
                className="p-4 transition hover:bg-slate-50"
                key={incident.id}
              >
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                  <SeverityPill value={incident.severity} />
                  <Link
                    className="min-w-0 flex-1 text-sm font-semibold text-slate-950 hover:underline"
                    href={`${QUEUE}/${incident.id}`}
                  >
                    {incident.message}
                  </Link>
                  <time
                    className="shrink-0 text-xs text-slate-500"
                    dateTime={incident.timestamp}
                    title={new Date(incident.timestamp).toLocaleString()}
                  >
                    {relativeTime(incident.timestamp)}
                  </time>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  {/*
                    The reference first and copyable, because it is the thing an
                    agent pastes into a reply to the customer.
                  */}
                  <button
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-200"
                    onClick={() => void copyReference(incident.referenceNumber)}
                    title="Copy reference"
                    type="button"
                  >
                    <Copy className="h-3 w-3" aria-hidden />
                    {copied === incident.referenceNumber
                      ? "Copied"
                      : incident.referenceNumber}
                  </button>
                  <span>{titleCase(incident.status)}</span>
                  <span>{incident.sourceApp}</span>
                  {incident.tenant?.name ? (
                    <span className="truncate">{incident.tenant.name}</span>
                  ) : null}
                  {incident.user?.email ? (
                    <span className="truncate">{incident.user.email}</span>
                  ) : null}
                  {incident.route ? (
                    <span className="truncate font-mono">
                      {incident.method ? `${incident.method} ` : ""}
                      {incident.route}
                      {incident.statusCode ? ` · ${incident.statusCode}` : ""}
                    </span>
                  ) : null}
                  {incident.assignedTo ? (
                    <span>Assigned</span>
                  ) : (
                    <span className="font-semibold text-amber-700">
                      Unassigned
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-12 text-center">
            <CheckCircle2
              aria-hidden
              className="mx-auto h-6 w-6 text-emerald-500"
            />
            <p className="mt-3 text-sm font-semibold text-slate-900">
              {incidents.length
                ? "No incident matches these filters."
                : "No incidents have been recorded."}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {incidents.length
                ? "Clear the filters to see the rest of the queue."
                : "Failures from the web app, admin console and API arrive here as they happen."}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            Showing {visible.length} of the {incidents.length} most recent.
          </p>
          <Link
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            href={queueHref}
          >
            Open in the full queue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </section>

      {/*
        Band 3 — the platform's own signal.
        Kept, because a spike in failed events explains a spike in incidents,
        and reduced to the part that carries information: the failure rate and
        where the failures came from. The success count is not a metric anybody
        acts on; it is the denominator, so it is shown as one.
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
                className={`text-2xl font-semibold ${
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
                    className="rounded-xl bg-slate-50 px-3 py-2"
                    key={source}
                  >
                    <dt className="text-xs text-slate-500">
                      {titleCase(source)}
                    </dt>
                    <dd className="text-sm font-semibold text-slate-900">
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
              <ArrowRight className="h-3 w-3" aria-hidden />
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
 * A figure that is also the way to act on it.
 *
 * `tone` never carries the meaning on its own — every tile states what it
 * counts and what that implies, and an agent who cannot see the colour loses
 * nothing but emphasis.
 */
function StatLink({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: typeof ShieldAlert;
  tone: "danger" | "warning" | "info" | "calm";
}) {
  const tones = {
    danger: "bg-rose-50 text-rose-700",
    warning: "bg-amber-50 text-amber-700",
    info: "bg-blue-50 text-blue-700",
    calm: "bg-emerald-50 text-emerald-700",
  };
  return (
    <Link
      className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
      href={href}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold text-slate-950">
          {value.toLocaleString()}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      </div>
      <span className={`shrink-0 rounded-xl p-2.5 ${tones[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
    </Link>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="sr-only">{label}</span>
      <select
        className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-900"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{label}: all</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SeverityPill({ value }: { value: string }) {
  const tones: Record<string, string> = {
    CRITICAL: "bg-rose-100 text-rose-900 ring-rose-300",
    ERROR: "bg-rose-50 text-rose-800 ring-rose-200",
    WARNING: "bg-amber-50 text-amber-900 ring-amber-200",
    INFO: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${
        tones[value] ?? tones.INFO
      }`}
    >
      {value === "CRITICAL" ? (
        <AlertTriangle className="h-3 w-3" aria-hidden />
      ) : null}
      {titleCase(value)}
    </span>
  );
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** "4 minutes ago", falling back to a date once relative stops helping. */
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
