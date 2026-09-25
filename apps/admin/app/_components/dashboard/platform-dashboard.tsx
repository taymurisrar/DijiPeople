"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  FileSignature,
  Handshake,
  Headphones,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";
import { RuntimeViewSelector } from "@/app/_components/runtime/runtime-view-selector";
import { DASHBOARD_VIEWS } from "@/lib/runtime/platform-module-registry";
import { formatDate } from "@/lib/formatters";
import {
  applicationsAwaitingReviewCount,
  metricValueOrUnavailable,
  partnerFunnelToRecord,
  relabelAgreementGroups,
  totalJobFailures,
  type OperationsSectionLike,
} from "@/lib/dashboard/operations-dashboard-metrics";

type TrendPoint = {
  key: string;
  label: string;
  [key: string]: string | number;
};
type QueueItem = { id: string;[key: string]: unknown };
type PeriodComparison = {
  current: number;
  previous: number;
  changePercent: number;
};

export type PlatformDashboardSummary = {
  customers: number;
  tenants: number;
  activeSubscriptions: number;
  openInvoices: number;
  collectedRevenue: number;
  outstandingRevenue: number;
  reportingCurrency: string;
  /*
   * The rates every money figure above was computed with, and anything they
   * could not express (BUG-1745).
   *
   * Its predecessor, `excludedCurrencies`, listed every currency that was not
   * the reporting one — which on production was all of them, because the
   * figures were *filtered* to a currency no record used. They are converted
   * now, so `unconvertible` is normally empty and an entry in it means a rate
   * is genuinely missing.
   *
   * Optional, so a bundle loaded against an API without it renders no chip
   * rather than throwing.
   */
  fx?: {
    base: string;
    ratesAsOf: string | null;
    rates: Array<{
      currency: string;
      rate: number;
      source: string;
      manualOverride: boolean;
    }>;
    unconvertible: Array<{ currency: string; amount: number; count: number }>;
  };
  partners: number;
  platformUsers: number;
  activePlatformUsers: number;
  criticalCases: number;
  breachedCases: number;
  failedPayments: number;
  commissionExposure: number;
  comparisons: {
    customers: PeriodComparison;
    leads: PeriodComparison;
    collectedRevenue: PeriodComparison;
  };
  timeRange: string;
  timeRangeLabel: string;
  leadBreakdown: Record<string, number>;
  onboardingBreakdown: Record<string, number>;
  invoiceBreakdown: Record<string, number>;
  supportBreakdown: Record<string, number>;
  tenantBreakdown: Record<string, number>;
  subscriptionBreakdown: Record<string, number>;
  partnerBreakdown: Record<string, number>;
  inquiryBreakdown: Record<string, number>;
  partnerOnboardingBreakdown: Record<string, number>;
  partnerLeadBreakdown: Record<string, number>;
  contractBreakdown: Record<string, number>;
  contractTypeBreakdown: Record<string, number>;
  signatureBreakdown: Record<string, number>;
  awaitingOurSignature: number;
  awaitingExternalSignature: number;
  oldestPendingSignatureDays: number;
  expiringContractCount: number;
  topPartnerBreakdown: Record<string, number>;
  approvalBreakdown: Record<string, number>;
  supportCaseBreakdown: Record<string, number>;
  supportSeverityBreakdown: Record<string, number>;
  commissionBreakdown: Record<string, number>;
  revenueTrend: TrendPoint[];
  leadTrend: TrendPoint[];
  recentlyActivatedTenants: QueueItem[];
  staleLeads: QueueItem[];
  expiringContracts: QueueItem[];
  recentPartnerReferrals: QueueItem[];
  refreshedAt: string;
};

/**
 * The Operations view's own data source (TASK-0032 WP-07 / ITEM-0199),
 * `GET /super-admin/dashboard-summary/operations`. Hand-mirrored from
 * `OperationsDashboardService` rather than imported — this app and the API
 * are separate TypeScript projects, same as `PlatformDashboardSummary` above.
 *
 * Every section resolves independently on the API side, so each one here is
 * a discriminated union rather than a plain object: a network hiccup
 * computing partner metrics must not stop tenant or error metrics from
 * rendering, and a widget fed an unavailable section shows that explicitly
 * rather than a fabricated zero.
 */
export type OperationsSection<T> =
  | { available: true; data: T }
  | { available: false; reason: string };

export type OperationsDashboardSummary = {
  refreshedAt: string;
  platform: OperationsSection<{
    tenantsTotal: number;
    tenantsActive: number;
    tenantsTrial: number;
    tenantsSuspended: number;
    tenantsStuckProvisioning: number;
    tenantsNewLast30Days: number;
    growthTrend: TrendPoint[];
  }>;
  users: OperationsSection<{
    activeUsers: number;
    newUsersLast30Days: number;
    pendingInvitations: number;
    loginsLast24h: number;
    failedLoginsLast24h: number;
    loginTrend: TrendPoint[];
    mfa: {
      tenant: { enabledActive: number; totalActive: number; ratePercent: number };
      platform: { enabledActive: number; totalActive: number; ratePercent: number };
    };
  }>;
  partners: OperationsSection<{
    total: number;
    active: number;
    byType: Record<string, number>;
    byModel: Record<string, number>;
    funnel: Array<{ key: string; label: string; count: number }>;
    recentlyActivated: Array<{ id: string; displayName: string; updatedAt: string }>;
  }>;
  agreements: OperationsSection<{
    byStatusGroup: Record<string, number>;
    pendingSignature: number;
    generationFailures: OperationsSection<number>;
  }>;
  operational: OperationsSection<{
    unresolvedErrors: number;
    errorsLast24h: number;
    errorTrend: TrendPoint[];
    jobFailures: { outboxFailed: number; platformEventsFailedLast24h: number };
    recentIncidents: Array<{
      id: string;
      errorCode: string;
      severity: string;
      module: string | null;
      occurrenceCount: number;
      lastSeenAt: string;
      supportStatus: string;
    }>;
  }>;
};

type Metric = {
  label: string;
  value: number | string;
  description: string;
  href: string;
  icon: typeof UsersRound;
  tone: "blue" | "emerald" | "amber" | "rose" | "violet";
  trend?: string;
};
type DashboardTrend = {
  title: string;
  points: TrendPoint[];
  series: Array<{ key: string; label: string; color: string }>;
  formatter?: (value: number) => string;
  cadenceLabel?: string;
};
type DashboardAlert = { tone: string; label: string; href: string };
type UnavailableNote = { id: string; title: string; reason: string };
type DashboardContent = {
  title: string;
  subtitle: string;
  metrics: Metric[];
  trend?: DashboardTrend;
  breakdownTitle: string;
  breakdown: Record<string, number>;
  breakdownOrdered?: boolean;
  secondaryTitle: string;
  secondary: Record<string, number>;
  queueTitle: string;
  queueDescription: string;
  queueItems: QueueItem[];
  queueEmpty: string;
  actions: Array<[string, string]>;
  alerts: DashboardAlert[];
  /*
   * Additive, optional, and read by nobody but the "operations" view today.
   * The other eight views produce none of these and render exactly as before
   * — this is the same generic widget system every view already goes
   * through (`buildDashboardWidgets`), extended to carry more than one trend
   * or distribution rather than replaced with a bespoke layout for one view.
   */
  extraTrends?: Array<{ id: string; trend: DashboardTrend }>;
  extraBreakdowns?: Array<{
    id: string;
    title: string;
    values: Record<string, number>;
    ordered?: boolean;
  }>;
  extraQueues?: Array<{
    id: string;
    title: string;
    description: string;
    items: QueueItem[];
    empty: string;
  }>;
  unavailable?: UnavailableNote[];
  /** Replaces the primary/secondary analysis slot with an unavailable-note instead of an empty chart. */
  primaryUnavailable?: UnavailableNote;
  secondaryUnavailable?: UnavailableNote;
};
type DashboardContext = {
  summary: PlatformDashboardSummary;
  operations: OperationsDashboardSummary | null;
  operationsError: string | null;
  money: Intl.NumberFormat;
  totalLeads: number;
  conversionRate: string;
  openCases: number;
  awaitingSignature: number;
  activeContracts: number;
  onboardingRate: string;
  activePartners: number;
  partnerConversion: string;
};

type DashboardWidgetType = keyof typeof DASHBOARD_WIDGET_REGISTRY;
type DashboardWidgetDefinition = {
  id: string;
  type: DashboardWidgetType;
  region: "kpi" | "analysis" | "operations";
  metric?: Metric;
  title?: string;
  description?: string;
  trend?: DashboardTrend;
  values?: Record<string, number>;
  /** When true, `values` renders in insertion order rather than sorted by value — a funnel's stage order is meaning, not decoration. */
  ordered?: boolean;
  items?: QueueItem[];
  empty?: string;
  actions?: Array<[string, string]>;
  alerts?: DashboardAlert[];
  reason?: string;
  permission?: string;
};

/**
 * Canonical widget capability registry. A module may select any capability;
 * the renderer family provides consistent loading, empty, responsive and
 * accessible behavior while the widget metadata supplies live data.
 */
export const DASHBOARD_WIDGET_REGISTRY = {
  "kpi-card": "metric",
  "kpi-card-with-comparison": "metric",
  "kpi-trend": "metric",
  "time-series-chart": "trend",
  "bar-chart": "breakdown",
  "stacked-bar-chart": "trend",
  "donut-chart": "breakdown",
  funnel: "breakdown",
  "stage-pipeline": "breakdown",
  "sla-summary": "breakdown",
  "aging-buckets": "breakdown",
  "financial-summary": "metric",
  "conversion-chart": "trend",
  "work-queue": "queue",
  "prioritized-record-list": "queue",
  "recent-activity": "queue",
  tasks: "queue",
  approvals: "queue",
  alerts: "actions",
  exceptions: "queue",
  forecast: "trend",
  "goal-progress": "breakdown",
  "breakdown-table": "breakdown",
  "system-health": "breakdown",
  "quick-actions": "actions",
  "saved-view": "actions",
  "drill-down-link": "actions",
  /**
   * One section of `OperationsDashboardSummary` came back unavailable. Not a
   * "breakdown" or a "queue" wearing the wrong data — a distinct capability
   * so it never silently renders as an empty chart implying zero activity
   * when the truth is "we don't know right now" (WP-07 / ITEM-0199).
   */
  "unavailable-note": "notice",
} as const;

export function PlatformDashboard({
  summary,
  operations = null,
  operationsError = null,
  defaultViewKey,
  roleKeys,
}: {
  summary: PlatformDashboardSummary;
  operations?: OperationsDashboardSummary | null;
  operationsError?: string | null;
  defaultViewKey?: string | null;
  roleKeys: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoRefresh, setAutoRefresh] = useState(false);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, router]);
  const available = DASHBOARD_VIEWS.filter(
    (candidate) =>
      !candidate.roles?.length ||
      candidate.roles.some((role) => roleKeys.includes(role)),
  );
  const selectedKey =
    searchParams.get("viewId") ??
    defaultViewKey ??
    available.find((item) => item.roleDefaultFor?.some((role) => roleKeys.includes(role)))
      ?.key ??
    available.find((item) => item.isSystemDefault)?.key ??
    available[0]?.key ??
    "executive";
  const viewKey = available.some((item) => item.key === selectedKey)
    ? selectedKey
    : (available[0]?.key ?? "executive");
  /*
   * A fixed locale, not the runtime's (BUG-1557).
   *
   * `undefined` means "whatever locale this JavaScript happens to be running
   * in" — which is the server's during SSR and the browser's during hydration.
   * Currency grouping and symbol placement differ between them, so every money
   * figure on this page was a hydration mismatch waiting to be counted.
   *
   * `en-US` matches `lib/formatters`, so the dashboard and every other admin
   * screen now format money the same way. Unlike the refresh timestamp above,
   * there is no reading of this value where the viewer's own locale is the
   * right answer and the server's is wrong — an amount is an amount.
   */
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: summary.reportingCurrency,
    maximumFractionDigits: 0,
  });
  const totalLeads = sum(summary.leadBreakdown);
  const convertedLeads = summary.leadBreakdown.CONVERTED ?? 0;
  const conversionRate = totalLeads
    ? `${((convertedLeads / totalLeads) * 100).toFixed(1)}%`
    : "0%";
  const openCases = Object.entries(summary.supportCaseBreakdown)
    .filter(([status]) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(status))
    .reduce((total, [, count]) => total + count, 0);
  const awaitingSignature =
    (summary.contractBreakdown.READY_FOR_SIGNATURE ?? 0) +
    (summary.contractBreakdown.APPROVED_FOR_SENDING ?? 0) +
    (summary.contractBreakdown.SENT ?? 0) +
    (summary.contractBreakdown.VIEWED ?? 0) +
    (summary.contractBreakdown.SIGNATURE_IN_PROGRESS ?? 0) +
    (summary.contractBreakdown.PARTIALLY_SIGNED ?? 0);
  const activeContracts =
    (summary.contractBreakdown.ACTIVE ?? 0) +
    (summary.contractBreakdown.FULLY_SIGNED ?? 0) +
    (summary.contractBreakdown.FULLY_EXECUTED ?? 0);
  const completedOnboarding = summary.onboardingBreakdown.COMPLETED ?? 0;
  const onboardingTotal = sum(summary.onboardingBreakdown);
  const onboardingRate = onboardingTotal
    ? `${((completedOnboarding / onboardingTotal) * 100).toFixed(1)}%`
    : "0%";
  const activePartners = summary.partnerBreakdown.ACTIVE ?? 0;
  const partnerLeads = sum(summary.partnerLeadBreakdown);
  const partnerConversion = partnerLeads
    ? `${(((summary.partnerLeadBreakdown.CONVERTED ?? 0) / partnerLeads) * 100).toFixed(1)}%`
    : "0%";

  const content = addPeriodComparisons(
    dashboardContent(viewKey, {
      summary,
      operations,
      operationsError,
      money,
      totalLeads,
      conversionRate,
      openCases,
      awaitingSignature,
      activeContracts,
      onboardingRate,
      activePartners,
      partnerConversion,
    }),
    summary,
  );
  const widgets = buildDashboardWidgets(content);

  return (
    <main className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-white to-[var(--admin-surface-tint)] p-5 shadow-sm lg:p-6">
        {/*
          Split at 2xl, not xl, and cap the control panel at 560px.
          `xl` is 1280px, and at 1280 the shell has already spent ~288px on the
          sidebar plus padding — so a 720px control column left the heading
          column about 215px wide. "Executive overview" wrapped onto two lines
          and the description became a vertical ribbon. Below 2xl the two blocks
          stack, which is the only honest layout at that width.
        */}
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)] 2xl:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--admin-primary)]">
              Live operations workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {content.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {content.subtitle}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
              {/*
                `suppressHydrationWarning`, because this text is *supposed* to
                differ between server and client (BUG-1557).

                `toLocaleString()` with no arguments formats in the runtime's
                own locale and timezone. Next server-renders this client
                component on a UTC server and then hydrates it in a browser
                somewhere else, so the two strings disagree by definition and
                React logs error #418 on every dashboard load.

                Formatting deterministically would fix the warning by showing
                every operator the server's clock, which is the wrong answer for
                a "when was this refreshed" stamp — the useful reading is the
                viewer's own time. So the difference is declared rather than
                removed.
              */}
              <span
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
                suppressHydrationWarning
              >
                Refreshed {new Date(summary.refreshedAt).toLocaleString()}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                {summary.timeRangeLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                Currency {summary.reportingCurrency}
              </span>
              {/*
                The rate behind the numbers, on the same line as the numbers.

                A converted figure is only as trustworthy as its rate, and an
                operator should never have to go looking for the rate to decide
                whether to believe a revenue total. The chip links to the screen
                where that rate can be corrected (BUG-1745).
              */}
              {summary.fx?.rates.length ? (
                <Link
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  href="/settings/exchange-rates"
                  title={summary.fx.rates
                    .map(
                      (rate) =>
                        `1 ${rate.currency} = ${rate.rate} ${summary.reportingCurrency}` +
                        (rate.manualOverride ? " (manual override)" : ""),
                    )
                    .join("\n")}
                >
                  Rates{" "}
                  {summary.fx.ratesAsOf
                    ? formatDate(summary.fx.ratesAsOf)
                    : "manual"}
                </Link>
              ) : null}
              {/*
                A zero still has to mean one thing.

                Money held in a currency the platform has no rate for is named
                here rather than dropped from the totals or, worse, added to
                them at par. Normally empty; an entry is a prompt to add a rate,
                not a permanent footnote.
              */}
              {summary.fx?.unconvertible.length ? (
                <Link
                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 font-medium text-amber-800 shadow-sm transition hover:bg-amber-100"
                  href="/settings/exchange-rates"
                  title={summary.fx.unconvertible
                    .map(
                      (entry) =>
                        `${entry.currency} ${entry.amount} is not counted — no exchange rate is set`,
                    )
                    .join("\n")}
                >
                  No rate for{" "}
                  {summary.fx.unconvertible
                    .map((entry) => entry.currency)
                    .join(", ")}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm sm:grid-cols-2 sm:items-end xl:grid-cols-[minmax(220px,1fr)_minmax(150px,auto)_auto_auto]">
            <RuntimeViewSelector
              moduleKey="dashboard"
              views={DASHBOARD_VIEWS}
              defaultViewKey={defaultViewKey}
              roleKeys={roleKeys}
            />
            <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Time range
              <select
                aria-label="Dashboard time range"
                value={searchParams.get("range") ?? summary.timeRange ?? "6m"}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams.toString());
                  next.set("range", event.target.value);
                  router.push(`/?${next.toString()}`);
                }}
                className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 shadow-sm"
              >
                <option value="30d">Last 30 days</option>
                <option value="3m">Last 3 months</option>
                <option value="6m">Last 6 months</option>
                <option value="12m">Last 12 months</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => router.refresh()}
              aria-label="Refresh"
              title="Refresh"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-pressed={autoRefresh}
              aria-label={autoRefresh ? "Disable live refresh" : "Enable live refresh"}
              title={autoRefresh ? "Live refresh on" : "Live refresh off"}
              onClick={() => setAutoRefresh((current) => !current)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm ${autoRefresh
                  ? "border-[var(--admin-primary)] bg-[var(--admin-surface-tint)] text-[var(--admin-primary)]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
            >
              <Activity className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <DashboardRuntime widgets={widgets} />
    </main>
  );
}

function buildDashboardWidgets(
  content: DashboardContent,
): DashboardWidgetDefinition[] {
  const widgets: DashboardWidgetDefinition[] = content.metrics.map(
    (metric, index) => ({
      id: `metric-${index}-${metric.label}`,
      type: metric.trend
        ? ("kpi-card-with-comparison" as const)
        : ("kpi-card" as const),
      region: "kpi",
      metric,
    }),
  );
  widgets.push(
    content.primaryUnavailable
      ? {
        id: content.primaryUnavailable.id,
        type: "unavailable-note" as const,
        region: "analysis" as const,
        title: content.primaryUnavailable.title,
        reason: content.primaryUnavailable.reason,
      }
      : content.trend
        ? {
          id: "primary-analysis",
          type: "time-series-chart" as const,
          region: "analysis" as const,
          trend: content.trend,
        }
        : {
          id: "primary-analysis",
          type: "bar-chart" as const,
          region: "analysis" as const,
          title: content.breakdownTitle,
          values: content.breakdown,
          ordered: content.breakdownOrdered,
        },
  );
  widgets.push(
    content.secondaryUnavailable
      ? {
        id: content.secondaryUnavailable.id,
        type: "unavailable-note" as const,
        region: "analysis" as const,
        title: content.secondaryUnavailable.title,
        reason: content.secondaryUnavailable.reason,
      }
      : {
        id: "secondary-analysis",
        type: "donut-chart" as const,
        region: "analysis" as const,
        title: content.secondaryTitle,
        values: content.secondary,
      },
  );
  widgets.push({
    id: "operations-queue",
    type: "work-queue" as const,
    region: "operations" as const,
    title: content.queueTitle,
    description: content.queueDescription,
    items: content.queueItems,
    empty: content.queueEmpty,
  });
  widgets.push({
    id: "actions-alerts",
    type: "quick-actions" as const,
    region: "operations" as const,
    actions: content.actions,
    alerts: content.alerts,
  });
  for (const extra of content.extraTrends ?? []) {
    widgets.push({
      id: extra.id,
      type: "time-series-chart" as const,
      region: "analysis" as const,
      trend: extra.trend,
    });
  }
  for (const extra of content.extraBreakdowns ?? []) {
    widgets.push({
      id: extra.id,
      type: "bar-chart" as const,
      region: "analysis" as const,
      title: extra.title,
      values: extra.values,
      ordered: extra.ordered,
    });
  }
  for (const extra of content.extraQueues ?? []) {
    widgets.push({
      id: extra.id,
      type: "work-queue" as const,
      region: "operations" as const,
      title: extra.title,
      description: extra.description,
      items: extra.items,
      empty: extra.empty,
    });
  }
  for (const note of content.unavailable ?? []) {
    widgets.push({
      id: note.id,
      type: "unavailable-note" as const,
      region: "operations" as const,
      title: note.title,
      reason: note.reason,
    });
  }
  return widgets;
}

function DashboardRuntime({
  widgets,
}: {
  widgets: DashboardWidgetDefinition[];
}) {
  const kpis = widgets.filter((widget) => widget.region === "kpi");
  const analysis = widgets.filter((widget) => widget.region === "analysis");
  const operations = widgets.filter((widget) => widget.region === "operations");
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((widget) => (
          <DashboardWidget key={widget.id} widget={widget} />
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        {analysis.map((widget) => (
          <DashboardWidget key={widget.id} widget={widget} />
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.65fr)]">
        {operations.map((widget) => (
          <DashboardWidget key={widget.id} widget={widget} />
        ))}
      </section>
    </>
  );
}

function DashboardWidget({ widget }: { widget: DashboardWidgetDefinition }) {
  const renderer = DASHBOARD_WIDGET_REGISTRY[widget.type];
  if (renderer === "metric" && widget.metric)
    return <MetricCard metric={widget.metric} />;
  if (renderer === "trend" && widget.trend)
    return <TrendChart {...widget.trend} />;
  if (renderer === "breakdown")
    return (
      <BreakdownChart
        title={widget.title ?? "Breakdown"}
        values={widget.values ?? {}}
        ordered={widget.ordered}
      />
    );
  if (renderer === "queue")
    return (
      <OperationsQueue
        title={widget.title ?? "Work queue"}
        description={widget.description ?? "Prioritized live records."}
        items={widget.items ?? []}
        empty={widget.empty ?? "No items require attention."}
      />
    );
  if (renderer === "notice")
    return (
      <UnavailableNotice
        title={widget.title ?? "Not available"}
        reason={widget.reason ?? "No data source for this metric yet."}
      />
    );
  return (
    <QuickActions actions={widget.actions ?? []} alerts={widget.alerts ?? []} />
  );
}

/**
 * A KPI whose section resolved shows the real figure; a KPI whose section
 * didn't shows "Not available" and the reason — never a zero standing in for
 * data that was never fetched (AGENTS.md "No fabricated numbers").
 */
function metricOrUnavailable<T>(
  section: OperationsSectionLike<T> | undefined,
  opsError: string | null,
  label: string,
  pick: (data: T) => { value: number | string; description: string },
  href: string,
  icon: typeof UsersRound,
  tone: Metric["tone"],
): Metric {
  const resolved = metricValueOrUnavailable(section, opsError, pick);
  return m(
    label,
    resolved.value,
    resolved.description,
    href,
    icon,
    resolved.reason ? "rose" : tone,
  );
}

/**
 * The "Operations" dashboard view (TASK-0032 WP-07 / ITEM-0199) — "what is
 * happening across the platform right now and what needs attention", built
 * from `GET /super-admin/dashboard-summary/operations`.
 *
 * Every one of the five source sections can be independently unavailable, so
 * this reads more defensively than the other views' `configs` entries: each
 * KPI degrades on its own (`metricOrUnavailable`), and a chart or queue whose
 * section failed is replaced with an explicit "not available" notice
 * (`unavailable`/`primaryUnavailable`/`secondaryUnavailable`) rather than
 * rendered as an empty, falsely-zero chart.
 */
function buildOperationsContent(
  ops: OperationsDashboardSummary | null,
  opsError: string | null,
  shared: Omit<DashboardContent, "title" | "subtitle" | "metrics">,
  recentlyActivatedTenants: QueueItem[],
): DashboardContent {
  const platform = ops?.platform;
  const users = ops?.users;
  const partners = ops?.partners;
  const agreements = ops?.agreements;
  const operational = ops?.operational;
  const fallbackReason = (
    section: { available: boolean; reason?: string } | undefined,
  ) =>
    section && !section.available
      ? section.reason
      : (opsError ?? "The operations dashboard endpoint did not respond.");

  const metrics: Metric[] = [
    metricOrUnavailable(
      platform,
      opsError,
      "Tenants",
      (data) => ({
        value: data.tenantsTotal,
        description: `${data.tenantsActive.toLocaleString()} active · ${data.tenantsTrial.toLocaleString()} trial · ${data.tenantsSuspended.toLocaleString()} suspended`,
      }),
      "/tenants",
      Building2,
      "blue",
    ),
    metricOrUnavailable(
      platform,
      opsError,
      "Stuck provisioning",
      (data) => ({
        value: data.tenantsStuckProvisioning,
        description: "Tenants in PROVISIONING or PROVISIONING_FAILED",
      }),
      "/operations/provisioning",
      AlertTriangle,
      "amber",
    ),
    metricOrUnavailable(
      users,
      opsError,
      "Active users",
      (data) => ({
        value: data.activeUsers,
        description: `${data.newUsersLast30Days.toLocaleString()} new in the last 30 days`,
      }),
      "/settings/security",
      UsersRound,
      "blue",
    ),
    metricOrUnavailable(
      users,
      opsError,
      "Failed sign-ins (24h)",
      (data) => ({
        value: data.failedLoginsLast24h,
        description: `${data.loginsLast24h.toLocaleString()} successful sign-ins in the same window`,
      }),
      "/settings/monitoring",
      ShieldCheck,
      "amber",
    ),
    metricOrUnavailable(
      operational,
      opsError,
      "Errors needing attention",
      (data) => ({
        value: data.unresolvedErrors,
        description: `${data.errorsLast24h.toLocaleString()} occurrences in the last 24h`,
      }),
      "/settings/monitoring/error-logs?viewKey=new",
      Activity,
      "rose",
    ),
    metricOrUnavailable(
      agreements,
      opsError,
      "Pending signatures",
      (data) => ({
        value: data.pendingSignature,
        description: "Agreements sent, viewed, or partially signed",
      }),
      "/contracts?viewId=awaiting-external-signature",
      FileSignature,
      "amber",
    ),
    metricOrUnavailable(
      partners,
      opsError,
      "Applications awaiting review",
      (data) => ({
        value: applicationsAwaitingReviewCount(data.funnel),
        description: "Submitted or under review",
      }),
      "/partners?viewId=under-review",
      ClipboardCheck,
      "violet",
    ),
    metricOrUnavailable(
      operational,
      opsError,
      "Background job failures",
      (data) => ({
        value: totalJobFailures(data.jobFailures),
        description: `${data.jobFailures.outboxFailed.toLocaleString()} outbox · ${data.jobFailures.platformEventsFailedLast24h.toLocaleString()} events (24h)`,
      }),
      "/settings/monitoring/events?result=FAILED&source=BACKGROUND",
      Server,
      "rose",
    ),
  ];

  const extraTrends: NonNullable<DashboardContent["extraTrends"]> = [];
  const extraBreakdowns: NonNullable<DashboardContent["extraBreakdowns"]> = [];
  const extraQueues: NonNullable<DashboardContent["extraQueues"]> = [];
  const unavailable: UnavailableNote[] = [];

  if (users?.available) {
    extraTrends.push({
      id: "logins-trend",
      trend: {
        title: "Tenant sign-ins vs failed sign-ins",
        points: users.data.loginTrend,
        series: [
          { key: "succeeded", label: "Succeeded", color: "bg-emerald-500" },
          { key: "failed", label: "Failed", color: "bg-rose-500" },
        ],
        cadenceLabel: "day",
      },
    });
  } else {
    unavailable.push({
      id: "logins-trend-unavailable",
      title: "Tenant sign-ins vs failed sign-ins",
      reason: fallbackReason(users) ?? "No data source.",
    });
  }

  if (operational?.available) {
    extraTrends.push({
      id: "errors-trend",
      trend: {
        title: "Error volume",
        points: operational.data.errorTrend,
        series: [{ key: "count", label: "Errors", color: "bg-rose-500" }],
        cadenceLabel: "day",
      },
    });
  } else {
    unavailable.push({
      id: "errors-trend-unavailable",
      title: "Error volume",
      reason: fallbackReason(operational) ?? "No data source.",
    });
  }

  if (partners?.available) {
    extraBreakdowns.push({
      id: "partners-by-type",
      title: "Partners by type",
      values: partners.data.byType,
    });
    extraBreakdowns.push({
      id: "partners-by-model",
      title: "Partners by commercial model",
      values: partners.data.byModel,
    });
    extraBreakdowns.push({
      id: "partners-funnel",
      title: "Partner onboarding funnel",
      values: partnerFunnelToRecord(partners.data.funnel),
      ordered: true,
    });
    extraQueues.push({
      id: "recently-activated-partners",
      title: "Recently activated partners",
      description: "Partners whose status most recently became active.",
      items: partners.data.recentlyActivated,
      empty: "No partners have activated recently.",
    });
  } else {
    const reason = fallbackReason(partners) ?? "No data source.";
    unavailable.push(
      { id: "partners-by-type-unavailable", title: "Partners by type", reason },
      { id: "partners-by-model-unavailable", title: "Partners by commercial model", reason },
      { id: "partners-funnel-unavailable", title: "Partner onboarding funnel", reason },
      {
        id: "partners-recent-unavailable",
        title: "Recently activated partners",
        reason,
      },
    );
  }

  const alerts: DashboardAlert[] = [];
  if (platform?.available && platform.data.tenantsStuckProvisioning > 0) {
    alerts.push({
      tone: "rose",
      label: `${platform.data.tenantsStuckProvisioning} tenants stuck in provisioning`,
      href: "/operations/provisioning",
    });
  }
  if (operational?.available && operational.data.unresolvedErrors > 0) {
    alerts.push({
      tone: "rose",
      label: `${operational.data.unresolvedErrors} unresolved application errors`,
      href: "/settings/monitoring/error-logs?viewKey=new",
    });
  }
  if (partners?.available) {
    const awaitingReview = applicationsAwaitingReviewCount(partners.data.funnel);
    if (awaitingReview > 0) {
      alerts.push({
        tone: "amber",
        label: `${awaitingReview} partner applications awaiting review`,
        href: "/partners?viewId=under-review",
      });
    }
  }
  if (agreements?.available && agreements.data.pendingSignature > 0) {
    alerts.push({
      tone: "amber",
      label: `${agreements.data.pendingSignature} agreements pending signature`,
      href: "/contracts?viewId=awaiting-external-signature",
    });
  }
  if (operational?.available) {
    const jobFailures = totalJobFailures(operational.data.jobFailures);
    if (jobFailures > 0) {
      alerts.push({
        tone: "rose",
        label: `${jobFailures} background job failures`,
        href: "/settings/monitoring/events?result=FAILED&source=BACKGROUND",
      });
    }
  }

  return {
    ...shared,
    title: "Operations",
    subtitle:
      "Tenants, users, partners, agreements, and system reliability, live, with what needs attention first.",
    metrics,
    trend: platform?.available
      ? {
        title: "Tenant growth (12 weeks)",
        points: platform.data.growthTrend,
        series: [{ key: "count", label: "New tenants", color: "bg-violet-500" }],
        cadenceLabel: "week",
      }
      : undefined,
    primaryUnavailable: platform?.available
      ? undefined
      : {
        id: "tenant-growth-unavailable",
        title: "Tenant growth (12 weeks)",
        reason: fallbackReason(platform) ?? "No data source.",
      },
    secondaryTitle: agreements?.available ? "Agreements by status" : "",
    secondary: agreements?.available
      ? relabelAgreementGroups(agreements.data.byStatusGroup)
      : {},
    secondaryUnavailable: agreements?.available
      ? undefined
      : {
        id: "agreements-by-status-unavailable",
        title: "Agreements by status",
        reason: fallbackReason(agreements) ?? "No data source.",
      },
    queueTitle: "Recently activated tenants",
    queueDescription: "The newest tenant workspaces to reach active status.",
    queueItems: recentlyActivatedTenants,
    queueEmpty: "No tenants have been activated recently.",
    actions: [
      ["Open provisioning queue", "/operations/provisioning"],
      ["Review error queue", "/settings/monitoring/error-logs"],
      ["Review partner applications", "/partners?viewId=under-review"],
    ],
    alerts,
    extraTrends,
    extraBreakdowns,
    extraQueues,
    unavailable,
  };
}

function dashboardContent(view: string, context: DashboardContext) {
  const {
    summary: s,
    operations,
    operationsError,
    money,
    totalLeads,
    conversionRate,
    openCases,
    awaitingSignature,
    activeContracts,
    onboardingRate,
    activePartners,
    partnerConversion,
  } = context;
  const shared: Omit<DashboardContent, "title" | "subtitle" | "metrics"> = {
    breakdownTitle: "",
    breakdown: {},
    secondaryTitle: "",
    secondary: {},
    queueTitle: "",
    queueDescription: "",
    queueItems: [],
    queueEmpty: "No items require attention.",
    actions: [],
    alerts: [],
  };
  const configs = {
    operations: buildOperationsContent(
      operations,
      operationsError,
      shared,
      s.recentlyActivatedTenants,
    ),
    executive: {
      ...shared,
      title: "Executive overview",
      subtitle:
        "Commercial performance, customer growth, agreements, and operational risk in one live view.",
      metrics: [
        m(
          "Customers",
          s.customers,
          "All customer accounts",
          "/customers",
          UsersRound,
          "blue",
        ),
        m(
          "Active tenants",
          s.tenantBreakdown.ACTIVE ?? 0,
          "Provisioned workspaces",
          "/tenants?status=ACTIVE",
          Building2,
          "violet",
        ),
        m(
          "Collected revenue",
          money.format(s.collectedRevenue),
          "Successful payments",
          "/payments",
          CircleDollarSign,
          "emerald",
        ),
        m(
          "Outstanding",
          money.format(s.outstandingRevenue),
          "Issued and overdue invoices",
          "/invoices",
          Banknote,
          "amber",
        ),
        m(
          "Lead conversion",
          conversionRate,
          `${totalLeads.toLocaleString()} total leads`,
          "/leads",
          TrendingUp,
          "blue",
        ),
        m(
          "Active agreements",
          activeContracts,
          "Signed and active contracts",
          "/contracts?status=ACTIVE",
          FileSignature,
          "emerald",
        ),
        m(
          "Awaiting signature",
          awaitingSignature,
          "Counterparty action required",
          "/contracts?status=SIGNATURE_IN_PROGRESS",
          FileSignature,
          "amber",
        ),
        m(
          "Critical cases",
          s.criticalCases,
          "Open S1 support cases",
          "/support/cases?severity=S1_CRITICAL",
          AlertTriangle,
          "rose",
        ),
      ],
      trend: {
        title: "Revenue trend",
        points: s.revenueTrend,
        series: [
          { key: "invoiced", label: "Invoiced", color: "bg-blue-500" },
          { key: "collected", label: "Collected", color: "bg-emerald-500" },
        ],
        formatter: (v: number) => money.format(v),
      },
      breakdownTitle: "",
      breakdown: {},
      secondaryTitle: "Tenant status distribution",
      secondary: s.tenantBreakdown,
      queueTitle: "Operational alerts",
      queueDescription:
        "Contracts nearing expiry and commercial work requiring follow-up.",
      queueItems: s.expiringContracts,
      queueEmpty: "No agreements expire in the next 90 days.",
      actions: [
        ["Create contract", "/contracts/new"],
        ["Review support", "/support/cases"],
        ["Open billing", "/invoices"],
      ],
      alerts: alerts(s, awaitingSignature, openCases),
    },
    presales: {
      ...shared,
      title: "Presales",
      subtitle:
        "Lead pipeline, channel performance, qualification workload, and conversion movement.",
      metrics: [
        m(
          "New leads",
          s.leadBreakdown.NEW ?? 0,
          "Untriaged opportunities",
          "/leads?status=NEW",
          UserRoundSearch,
          "blue",
        ),
        m(
          "Awaiting approval",
          s.partnerLeadBreakdown.SUBMITTED ?? 0,
          "Partner leads for review",
          "/leads?partnerReviewStatus=SUBMITTED",
          ClipboardCheck,
          "amber",
        ),
        m(
          "Qualified",
          s.leadBreakdown.QUALIFIED ?? 0,
          "Sales-ready opportunities",
          "/leads?status=QUALIFIED",
          TrendingUp,
          "emerald",
        ),
        m(
          "Conversion rate",
          conversionRate,
          `${totalLeads.toLocaleString()} captured leads`,
          "/leads",
          TrendingUp,
          "violet",
        ),
      ],
      trend: {
        title: "Lead creation and conversion",
        points: s.leadTrend,
        series: [
          { key: "created", label: "Created", color: "bg-blue-500" },
          { key: "converted", label: "Converted", color: "bg-emerald-500" },
        ],
      },
      secondaryTitle: "Leads by stage",
      secondary: s.leadBreakdown,
      queueTitle: "Stale opportunities",
      queueDescription: "Open leads with no update for at least 14 days.",
      queueItems: s.staleLeads,
      queueEmpty: "No stale opportunities.",
      actions: [
        ["Create lead", "/leads/new"],
        ["Review partner leads", "/leads?partnerReviewStatus=SUBMITTED"],
        ["Open onboarding", "/onboarding"],
      ],
      alerts: [],
    },
    "partner-operations": {
      ...shared,
      title: "Partner operations",
      subtitle:
        "Applications, onboarding reviews, agreements, submitted leads, and commission exposure.",
      metrics: [
        m(
          "New inquiries",
          (s.partnerBreakdown.INQUIRY ?? 0) +
          (s.partnerBreakdown.NEW_INQUIRY ?? 0),
          "Public partner applications",
          "/partners?viewId=partner-inquiries",
          Handshake,
          "blue",
        ),
        m(
          "Under review",
          s.partnerBreakdown.UNDER_REVIEW ?? 0,
          "Applications in qualification review",
          "/partners?viewId=under-review",
          ClipboardCheck,
          "amber",
        ),
        m(
          "Awaiting agreement",
          s.partnerBreakdown.APPROVED_AWAITING_AGREEMENT ?? 0,
          "Approved partners awaiting an agreement",
          "/partners?viewId=agreement-pending",
          FileSignature,
          "amber",
        ),
        m(
          "Awaiting onboarding",
          s.partnerBreakdown.ONBOARDING_PENDING ?? 0,
          "Executed agreements awaiting onboarding",
          "/partners?viewId=pending-onboarding",
          ClipboardCheck,
          "violet",
        ),
        m(
          "Active partners",
          activePartners,
          "Activated referral partners",
          "/partners?status=ACTIVE",
          Handshake,
          "emerald",
        ),
        m(
          "Suspended partners",
          s.partnerBreakdown.SUSPENDED ?? 0,
          "Partner accounts requiring review",
          "/partners?viewId=suspended",
          Handshake,
          "rose",
        ),
        m(
          "Partner-referred leads",
          sum(s.partnerLeadBreakdown),
          "All attributed leads",
          "/leads?viewId=partner-referred-leads",
          UserRoundSearch,
          "blue",
        ),
        m(
          "Qualified referrals",
          s.partnerLeadBreakdown.QUALIFIED ?? 0,
          "Qualified partner-attributed leads",
          "/leads?viewId=partner-referred-leads&status=QUALIFIED",
          TrendingUp,
          "emerald",
        ),
        m(
          "Converted referrals",
          s.partnerLeadBreakdown.CONVERTED ?? 0,
          `Conversion rate ${partnerConversion}`,
          "/leads?viewId=partner-referred-leads&status=CONVERTED",
          TrendingUp,
          "violet",
        ),
        m(
          "Referral conversion rate",
          partnerConversion,
          "Converted partner referrals",
          "/leads?viewId=partner-referred-leads&status=CONVERTED",
          TrendingUp,
          "violet",
        ),
        m(
          "Commission exposure",
          money.format(s.commissionExposure),
          "Pending, approved, and payable",
          "/commissions",
          CircleDollarSign,
          "violet",
        ),
      ],
      breakdownTitle: "Partner lifecycle",
      breakdown: s.partnerBreakdown,
      secondaryTitle: "Top Partners by referred Leads",
      secondary: s.topPartnerBreakdown,
      queueTitle: "Recent referral activity",
      queueDescription: "Latest leads captured through active partner links.",
      queueItems: s.recentPartnerReferrals,
      queueEmpty: "No partner referral activity yet.",
      actions: [
        ["Review applications", "/partners?viewId=partner-inquiries"],
        [
          "Create agreement",
          "/contracts/new?contractType=MASTER_PARTNER_AGREEMENT",
        ],
        ["Review commissions", "/commissions"],
      ],
      alerts: [
        {
          tone: "amber",
          label: `${s.partnerLeadBreakdown.NEW ?? 0} new partner referrals`,
          href: "/leads?viewId=partner-referred-leads&status=NEW",
        },
        {
          tone: "blue",
          label: `Partner lead approval rate ${partnerConversion}`,
          href: "/leads",
        },
      ],
    },
    "agreement-operations": {
      ...shared,
      title: "Agreement operations",
      subtitle:
        "Drafting, approvals, signature queues, execution, expiry, and legal exceptions.",
      metrics: [
        m(
          "Draft agreements",
          s.contractBreakdown.DRAFT ?? 0,
          "Agreements being prepared",
          "/contracts?viewId=drafts",
          FileSignature,
          "blue",
        ),
        m(
          "Ready to send",
          (s.contractBreakdown.APPROVED_FOR_SENDING ?? 0) +
          (s.contractBreakdown.READY_FOR_SIGNATURE ?? 0),
          "Approved signature packages",
          "/contracts?viewId=ready-to-send",
          FileSignature,
          "violet",
        ),
        m(
          "Awaiting our signature",
          s.awaitingOurSignature,
          "Required DijiPeople signer action",
          "/contracts?viewId=awaiting-our-signature",
          FileSignature,
          "amber",
        ),
        m(
          "Awaiting external signature",
          s.awaitingExternalSignature,
          "Required counterparty signer action",
          "/contracts?viewId=awaiting-external-signature",
          FileSignature,
          "amber",
        ),
        m(
          "Partially signed",
          s.contractBreakdown.PARTIALLY_SIGNED ?? 0,
          "Some required parties have signed",
          "/contracts?viewId=partially-signed",
          FileSignature,
          "violet",
        ),
        m(
          "Fully executed",
          (s.contractBreakdown.FULLY_EXECUTED ?? 0) +
          (s.contractBreakdown.FULLY_SIGNED ?? 0),
          "Immutable completed agreements",
          "/contracts?viewId=fully-executed",
          FileSignature,
          "emerald",
        ),
        m(
          "Expiring soon",
          s.expiringContractCount,
          "Agreements expiring within 90 days",
          "/contracts?viewId=expiring-soon",
          FileSignature,
          "amber",
        ),
        m(
          "Declined",
          s.contractBreakdown.DECLINED ?? 0,
          "Signature requests declined",
          "/contracts?viewId=declined",
          AlertTriangle,
          "rose",
        ),
        m(
          "Voided",
          s.contractBreakdown.VOIDED ?? 0,
          "Voided before execution",
          "/contracts?viewId=voided",
          AlertTriangle,
          "rose",
        ),
        m(
          "Oldest pending signature",
          `${s.oldestPendingSignatureDays}d`,
          "Age of the oldest required signer action",
          "/contracts?viewId=awaiting-external-signature",
          FileSignature,
          "amber",
        ),
      ],
      breakdownTitle: "Agreement lifecycle",
      breakdown: s.contractBreakdown,
      secondaryTitle: "Signature request status",
      secondary: s.signatureBreakdown,
      queueTitle: "Expiring soon",
      queueDescription: "Executed agreements reaching expiry within 90 days.",
      queueItems: s.expiringContracts,
      queueEmpty: "No agreements are nearing expiry.",
      actions: [
        ["Create agreement", "/contracts/new"],
        ["Ready to send", "/contracts?viewId=ready-to-send"],
        [
          "Awaiting signatures",
          "/contracts?viewId=awaiting-external-signature",
        ],
      ],
      alerts: awaitingSignature
        ? [
          {
            tone: "amber",
            label: `${awaitingSignature} agreements are awaiting signatures`,
            href: "/contracts?viewId=awaiting-external-signature",
          },
        ]
        : [],
    },
    "customer-onboarding": {
      ...shared,
      title: "Customer onboarding",
      subtitle:
        "Agreement readiness, provisioning progress, ownership, and activation blockers.",
      metrics: [
        m(
          "In onboarding",
          sum(s.onboardingBreakdown) - (s.onboardingBreakdown.COMPLETED ?? 0),
          "Active onboarding records",
          "/onboarding",
          ClipboardCheck,
          "blue",
        ),
        m(
          "Completion rate",
          onboardingRate,
          "Completed onboarding records",
          "/onboarding?status=COMPLETED",
          TrendingUp,
          "emerald",
        ),
        m(
          "Customer signatures",
          s.signatureBreakdown.SENT ?? 0,
          "Signature requests sent",
          "/signature-requests?status=SENT",
          FileSignature,
          "amber",
        ),
        m(
          "Recently active",
          s.recentlyActivatedTenants.length,
          "Latest active tenants",
          "/tenants?status=ACTIVE",
          Building2,
          "violet",
        ),
      ],
      breakdownTitle: "Onboarding stage funnel",
      breakdown: s.onboardingBreakdown,
      secondaryTitle: "Tenant provisioning status",
      secondary: s.tenantBreakdown,
      queueTitle: "Recently activated tenants",
      queueDescription: "Latest customer workspaces to reach active status.",
      queueItems: s.recentlyActivatedTenants,
      queueEmpty: "No tenants have been activated yet.",
      actions: [
        ["Create customer", "/customers/new"],
        ["Review onboarding", "/onboarding"],
        [
          "Create customer agreement",
          "/contracts/new?contractType=CUSTOMER_AGREEMENT",
        ],
      ],
      alerts: awaitingSignature
        ? [
          {
            tone: "amber",
            label: `${awaitingSignature} contracts awaiting signature`,
            href: "/contracts?status=SIGNATURE_IN_PROGRESS",
          },
        ]
        : [],
    },
    "customer-support": {
      ...shared,
      title: "Customer support",
      subtitle:
        "Case queues, SLA exposure, severity, ownership, and customer communication workload.",
      metrics: [
        m(
          "Open cases",
          openCases,
          "All active support cases",
          "/support/cases",
          Headphones,
          "blue",
        ),
        m(
          "Investigating",
          s.supportCaseBreakdown.INVESTIGATING ?? 0,
          "Active investigations",
          "/support/cases?status=INVESTIGATING",
          Activity,
          "amber",
        ),
        m(
          "SLA breached",
          s.breachedCases,
          "Resolution target exceeded",
          "/support/cases?viewId=sla-breached",
          AlertTriangle,
          "rose",
        ),
        m(
          "Resolved",
          s.supportCaseBreakdown.RESOLVED ?? 0,
          "Resolved awaiting closure",
          "/support/cases?status=RESOLVED",
          ShieldCheck,
          "emerald",
        ),
      ],
      breakdownTitle: "Cases by status",
      breakdown: s.supportCaseBreakdown,
      secondaryTitle: "Cases by severity",
      secondary: s.supportSeverityBreakdown,
      queueTitle: "Support escalation queue",
      queueDescription:
        "Critical and overdue work is prioritized in the case workspace.",
      queueItems: [],
      queueEmpty: s.breachedCases
        ? `${s.breachedCases.toLocaleString()} breached cases require triage.`
        : "No breached SLA targets.",
      actions: [
        ["Create support case", "/support/cases/new"],
        ["Open intake queue", "/support/cases"],
        ["Review incidents", "/settings/monitoring/error-logs"],
      ],
      alerts: [
        {
          tone: s.criticalCases ? "rose" : "emerald",
          label: `${s.criticalCases} open critical cases`,
          href: "/support/cases?severity=S1_CRITICAL",
        },
        {
          tone: s.breachedCases ? "rose" : "emerald",
          label: `${s.breachedCases} SLA breaches`,
          href: "/support/cases?viewId=sla-breached",
        },
      ],
    },
    "billing-revenue": {
      ...shared,
      title: "Billing and revenue",
      subtitle: `Subscription, invoice, collections, and partner commission data in ${s.reportingCurrency}.`,
      metrics: [
        m(
          "Active subscriptions",
          s.subscriptionBreakdown.ACTIVE ?? 0,
          "Currently active",
          "/subscriptions?status=ACTIVE",
          TrendingUp,
          "blue",
        ),
        m(
          "Open invoices",
          s.openInvoices,
          "Issued and overdue",
          "/invoices",
          Banknote,
          "amber",
        ),
        m(
          "Collected",
          money.format(s.collectedRevenue),
          "Successful payments",
          "/payments",
          CircleDollarSign,
          "emerald",
        ),
        m(
          "Failed payments",
          s.failedPayments,
          "Payments requiring action",
          "/payments?status=FAILED",
          AlertTriangle,
          "rose",
        ),
      ],
      trend: {
        title: "Revenue and collection trend",
        points: s.revenueTrend,
        series: [
          { key: "invoiced", label: "Invoiced", color: "bg-blue-500" },
          { key: "collected", label: "Collected", color: "bg-emerald-500" },
        ],
        formatter: (v: number) => money.format(v),
      },
      secondaryTitle: "Invoice status",
      secondary: s.invoiceBreakdown,
      queueTitle: "Collection priorities",
      queueDescription:
        "Use invoice views to work overdue balances and failed collection attempts.",
      queueItems: [],
      queueEmpty: `${s.openInvoices.toLocaleString()} open invoices · ${money.format(s.outstandingRevenue)} outstanding.`,
      actions: [
        ["Open invoices", "/invoices"],
        ["Review payments", "/payments"],
        ["Review commissions", "/commissions"],
      ],
      alerts: s.failedPayments
        ? [
          {
            tone: "rose",
            label: `${s.failedPayments} failed payments`,
            href: "/payments?status=FAILED",
          },
        ]
        : [],
    },
    "platform-administration": {
      ...shared,
      title: "Platform administration",
      subtitle:
        "Tenants, users, approvals, configuration, security, and privileged operations.",
      metrics: [
        m(
          "Customers",
          s.customers,
          "Customer records",
          "/customers",
          UsersRound,
          "blue",
        ),
        m(
          "Tenants",
          s.tenants,
          "All tenant workspaces",
          "/tenants",
          Building2,
          "violet",
        ),
        m(
          "Platform users",
          s.platformUsers,
          `${s.activePlatformUsers} active`,
          "/settings/users",
          ShieldCheck,
          "emerald",
        ),
        m(
          "Pending approvals",
          s.approvalBreakdown.PENDING ?? 0,
          "Internal decisions required",
          "/contracts?status=INTERNAL_REVIEW",
          ClipboardCheck,
          "amber",
        ),
      ],
      breakdownTitle: "Tenant status",
      breakdown: s.tenantBreakdown,
      secondaryTitle: "Approval queue",
      secondary: s.approvalBreakdown,
      queueTitle: "Latest active tenants",
      queueDescription:
        "Recent workspace activity for platform administrators.",
      queueItems: s.recentlyActivatedTenants,
      queueEmpty: "No active tenants.",
      actions: [
        ["Manage users", "/settings/users"],
        ["Manage permissions", "/settings/roles"],
        ["Platform settings", "/settings"],
      ],
      alerts: [],
    },
    "system-health": {
      ...shared,
      title: "System health",
      subtitle:
        "Application incidents, support impact, delivery failures, and operational reliability signals.",
      metrics: [
        m(
          "Diagnostic incidents",
          sum(s.supportBreakdown),
          "Sanitized application errors",
          "/settings/monitoring/error-logs",
          Activity,
          "blue",
        ),
        m(
          "Open support cases",
          openCases,
          "Customer-facing cases",
          "/support/cases",
          Headphones,
          "amber",
        ),
        m(
          "Critical cases",
          s.criticalCases,
          "Open S1 cases",
          "/support/cases?severity=S1_CRITICAL",
          AlertTriangle,
          "rose",
        ),
        m(
          "SLA breached",
          s.breachedCases,
          "Resolution target missed",
          "/support/cases?viewId=sla-breached",
          AlertTriangle,
          "rose",
        ),
      ],
      breakdownTitle: "Incidents by workflow status",
      breakdown: s.supportBreakdown,
      secondaryTitle: "Customer case severity",
      secondary: s.supportSeverityBreakdown,
      queueTitle: "Reliability priorities",
      queueDescription:
        "Diagnostic incidents remain separate from customer-facing support cases.",
      queueItems: [],
      queueEmpty:
        s.criticalCases || s.breachedCases
          ? "Critical or overdue cases require investigation."
          : "No critical reliability alerts.",
      actions: [
        ["Open monitoring", "/settings/monitoring/error-logs"],
        ["Open support cases", "/support/cases"],
      ],
      alerts: [
        {
          tone: s.criticalCases ? "rose" : "emerald",
          label: `${s.criticalCases} critical customer-impacting cases`,
          href: "/support/cases?severity=S1_CRITICAL",
        },
      ],
    },
  } satisfies Record<string, DashboardContent>;
  const byView: Record<string, DashboardContent> = configs;
  return byView[view] ?? configs.executive;
}

function m(
  label: string,
  value: number | string,
  description: string,
  href: string,
  icon: typeof UsersRound,
  tone: Metric["tone"],
): Metric {
  return { label, value, description, href, icon, tone };
}

function addPeriodComparisons(
  content: DashboardContent,
  summary: PlatformDashboardSummary,
): DashboardContent {
  const byLabel: Record<string, PeriodComparison> = {
    Customers: summary.comparisons.customers,
    "Total customers": summary.comparisons.customers,
    "New leads": summary.comparisons.leads,
    "Collected revenue": summary.comparisons.collectedRevenue,
    Collected: summary.comparisons.collectedRevenue,
  };
  return {
    ...content,
    metrics: content.metrics.map((metric) => {
      const comparison = byLabel[metric.label];
      if (!comparison) return metric;
      const trend =
        comparison.previous === 0
          ? comparison.current === 0
            ? "No prior data"
            : "No prior data for comparison"
          : comparison.changePercent === 0
            ? "No change vs previous period"
            : `${comparison.changePercent > 0 ? "↑" : "↓"} ${Math.abs(comparison.changePercent).toFixed(1)}% vs previous period`;
      return {
        ...metric,
        trend,
      };
    }),
  };
}
function alerts(
  s: PlatformDashboardSummary,
  awaiting: number,
  openCases: number,
) {
  return [
    {
      tone: s.criticalCases ? "rose" : "emerald",
      label: `${s.criticalCases} critical support cases`,
      href: "/support/cases?severity=S1_CRITICAL",
    },
    {
      tone: awaiting ? "amber" : "emerald",
      label: `${awaiting} contracts awaiting signature`,
      href: "/contracts?status=SIGNATURE_IN_PROGRESS",
    },
    {
      tone: openCases ? "blue" : "emerald",
      label: `${openCases} open customer cases`,
      href: "/support/cases",
    },
  ];
}

function MetricCard({ metric }: { metric: Metric }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
  };
  const Icon = metric.icon;
  return (
    <Link
      href={metric.href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <span className={`rounded-xl p-2.5 ${tones[metric.tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
        <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {metric.label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
        {typeof metric.value === "number"
          ? metric.value.toLocaleString()
          : metric.value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{metric.description}</p>
      {metric.trend ? (
        <p className="mt-2 text-xs font-semibold text-[var(--admin-primary)]">
          {metric.trend}
        </p>
      ) : null}
    </Link>
  );
}

function BreakdownChart({
  title,
  values,
  ordered = false,
}: {
  title: string;
  values: Record<string, number>;
  /** A funnel's stage order is meaning, not decoration — skip the usual biggest-first sort. */
  ordered?: boolean;
}) {
  const entries = ordered
    ? Object.entries(values)
    : Object.entries(values).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const colors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-cyan-500",
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">
        Live distribution with drill-through links in the related workspace.
      </p>
      <div className="mt-5 space-y-3.5">
        {entries.length ? (
          entries.map(([key, value], index) => (
            <div key={key}>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="font-medium text-slate-700">
                  {labelize(key)}
                </span>
                <span className="font-semibold text-slate-950">
                  {value.toLocaleString()}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${labelize(key)} ${value.toLocaleString()} of ${max.toLocaleString()}`}
                title={`${labelize(key)}: ${value.toLocaleString()}`}
              >
                <div
                  className={`h-full rounded-full ${colors[index % colors.length]}`}
                  style={{
                    width: `${Math.max(value ? 3 : 0, (value / max) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <Empty text="No records are available for this breakdown." />
        )}
      </div>
      {/* The scale every bar's width is relative to — colour and length both carry the value, but neither states the axis. */}
      {entries.length ? (
        <div className="mt-3 flex justify-between text-[10px] font-medium text-slate-400">
          <span>0</span>
          <span>{max.toLocaleString()}</span>
        </div>
      ) : null}
    </section>
  );
}

function TrendChart({
  title,
  points,
  series,
  formatter = (value: number) => value.toLocaleString(),
  cadenceLabel = "month",
}: {
  title: string;
  points: TrendPoint[];
  series: Array<{ key: string; label: string; color: string }>;
  formatter?: (value: number) => string;
  /** "week" / "day" / "month" — the bar-chart caption assumed monthly data unconditionally. */
  cadenceLabel?: string;
}) {
  const max = Math.max(
    1,
    ...points.flatMap((point) =>
      series.map((item) => Number(point[item.key] ?? 0)),
    ),
  );
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {points.length}-{cadenceLabel} operational trend from persisted records.
          </p>
        </div>
        <div className="flex gap-3">
          {series.map((item) => (
            <span
              key={item.key}
              className="flex items-center gap-1.5 text-xs text-slate-600"
            >
              <span className={`h-2.5 w-2.5 rounded-sm ${item.color}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-6 flex items-stretch gap-2">
        <div className="flex h-52 flex-col justify-between py-0.5 text-[10px] font-medium text-slate-400">
          <span>{formatter(max)}</span>
          <span>0</span>
        </div>
        <div
          className="grid h-52 flex-1 items-end gap-3 overflow-x-auto border-b border-l border-slate-200 px-1"
          style={{
            gridTemplateColumns: `repeat(${points.length}, minmax(48px, 1fr))`,
          }}
          role="img"
          aria-label={`${title}. ${series.map((item) => item.label).join(" vs ")}, ${points.length} ${cadenceLabel}s ending ${points[points.length - 1]?.label ?? "now"}.`}
        >
          {points.map((point) => (
            <div
              key={point.key}
              className="flex h-full min-w-0 flex-col justify-end"
            >
              <div className="flex flex-1 items-end justify-center gap-1">
                {series.map((item) => {
                  const value = Number(point[item.key] ?? 0);
                  return (
                    <div
                      key={item.key}
                      title={`${item.label}: ${formatter(value)}`}
                      className={`w-[35%] min-w-2 rounded-t-md ${item.color}`}
                      style={{
                        height: `${Math.max(value ? 4 : 0, (value / max) * 100)}%`,
                      }}
                    />
                  );
                })}
              </div>
              <span className="py-2 text-center text-[10px] font-medium text-slate-500">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/*
        A screen reader announces the chart's `aria-label` once and stops —
        the bars themselves carry no accessible text of their own. This gives
        the same values as a real table rather than a shape nobody but a
        sighted user can read.
      */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((item) => (
              <th scope="col" key={item.key}>
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.label}</th>
              {series.map((item) => (
                <td key={item.key}>{formatter(Number(point[item.key] ?? 0))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UnavailableNotice({ title, reason }: { title: string; reason: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <h2 className="text-base font-semibold text-slate-700">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">Not available right now.</p>
      <p className="mt-1 text-xs text-slate-400">{reason}</p>
    </section>
  );
}

function OperationsQueue({
  title,
  description,
  items,
  empty,
}: {
  title: string;
  description: string;
  items: QueueItem[];
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-4 divide-y divide-slate-100">
        {items.length ? (
          items.map((item) => {
            // `displayName` with no `companyName`/`contractNumber` is a
            // Partner row (WP-07's "recently activated partners" queue) —
            // added rather than folded into the tenant fallback, since a
            // partner id resolved against `/tenants/:id` would 404.
            const isPartner =
              "displayName" in item &&
              !("companyName" in item) &&
              !("contractNumber" in item);
            const href =
              "contractNumber" in item
                ? `/contracts/${item.id}`
                : "companyName" in item
                  ? `/leads/${item.id}`
                  : isPartner
                    ? `/partners/${item.id}`
                    : `/tenants/${item.id}`;
            const title = String(
              item.title ?? item.companyName ?? item.displayName ?? item.name ?? item.id,
            );
            const detail = String(
              item.contractNumber ??
              item.status ??
              (item.expiryDate
                ? formatDate(String(item.expiryDate))
                : item.createdAt
                  ? formatDate(String(item.createdAt))
                  : item.updatedAt
                    ? formatDate(String(item.updatedAt))
                    : ""),
            );
            return (
              <Link
                key={item.id}
                href={href}
                className="flex items-center justify-between gap-4 py-3 text-sm hover:text-[var(--admin-primary)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {detail}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            );
          })
        ) : (
          <Empty text={empty} />
        )}
      </div>
    </section>
  );
}

function QuickActions({
  actions,
  alerts,
}: {
  actions: Array<[string, string]>;
  alerts: Array<{ tone: string; label: string; href: string }>;
}) {
  const tone: Record<string, string> = {
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">
        Actions and alerts
      </h2>
      {alerts.length ? (
        <div className="mt-4 space-y-2">
          {alerts.map((alert) => (
            <Link
              key={alert.label}
              href={alert.href}
              className={`block rounded-xl border px-3 py-2.5 text-xs font-semibold ${tone[alert.tone] ?? tone.blue}`}
            >
              {alert.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {actions.map(([label, href]) => (
          <Link
            key={label}
            href={href}
            className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {label}
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{text}</p>
  );
}
function sum(values: Record<string, number>) {
  return Object.values(values).reduce((total, value) => total + value, 0);
}
function labelize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
