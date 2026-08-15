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
  ShieldCheck,
  TrendingUp,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";
import { RuntimeViewSelector } from "@/app/_components/runtime/runtime-view-selector";
import { DASHBOARD_VIEWS } from "@/lib/runtime/platform-module-registry";

type TrendPoint = {
  key: string;
  label: string;
  [key: string]: string | number;
};
type QueueItem = { id: string; [key: string]: unknown };
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
};
type DashboardAlert = { tone: string; label: string; href: string };
type DashboardContent = {
  title: string;
  subtitle: string;
  metrics: Metric[];
  trend?: DashboardTrend;
  breakdownTitle: string;
  breakdown: Record<string, number>;
  secondaryTitle: string;
  secondary: Record<string, number>;
  queueTitle: string;
  queueDescription: string;
  queueItems: QueueItem[];
  queueEmpty: string;
  actions: Array<[string, string]>;
  alerts: DashboardAlert[];
};
type DashboardContext = {
  summary: PlatformDashboardSummary;
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
  items?: QueueItem[];
  empty?: string;
  actions?: Array<[string, string]>;
  alerts?: DashboardAlert[];
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
} as const;

export function PlatformDashboard({
  summary,
  defaultViewKey,
  roleKeys,
}: {
  summary: PlatformDashboardSummary;
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
    available.find((item) => item.isSystemDefault)?.key ??
    available[0]?.key ??
    "executive";
  const viewKey = available.some((item) => item.key === selectedKey)
    ? selectedKey
    : (available[0]?.key ?? "executive");
  const money = new Intl.NumberFormat(undefined, {
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
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                Refreshed {new Date(summary.refreshedAt).toLocaleString()}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                {summary.timeRangeLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                Currency {summary.reportingCurrency}
              </span>
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button
              type="button"
              aria-pressed={autoRefresh}
              onClick={() => setAutoRefresh((current) => !current)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm ${autoRefresh ? "border-[var(--admin-primary)] bg-[var(--admin-surface-tint)] text-[var(--admin-primary)]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              <Activity className="h-4 w-4" /> Live {autoRefresh ? "on" : "off"}
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
    content.trend
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
        },
  );
  widgets.push({
    id: "secondary-analysis",
    type: "donut-chart" as const,
    region: "analysis" as const,
    title: content.secondaryTitle,
    values: content.secondary,
  });
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
  return (
    <QuickActions actions={widget.actions ?? []} alerts={widget.alerts ?? []} />
  );
}

function dashboardContent(view: string, context: DashboardContext) {
  const {
    summary: s,
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
}: {
  title: string;
  values: Record<string, number>;
}) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
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
                aria-label={`${labelize(key)} ${value}`}
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
    </section>
  );
}

function TrendChart({
  title,
  points,
  series,
  formatter = (value: number) => value.toLocaleString(),
}: {
  title: string;
  points: TrendPoint[];
  series: Array<{ key: string; label: string; color: string }>;
  formatter?: (value: number) => string;
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
            {points.length}-month operational trend from persisted records.
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
      <div
        className="mt-6 grid h-52 items-end gap-3 overflow-x-auto border-b border-slate-200 px-1"
        style={{
          gridTemplateColumns: `repeat(${points.length}, minmax(48px, 1fr))`,
        }}
        role="img"
        aria-label={title}
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
            const href =
              "contractNumber" in item
                ? `/contracts/${item.id}`
                : "companyName" in item
                  ? `/leads/${item.id}`
                  : `/tenants/${item.id}`;
            const title = String(
              item.title ?? item.companyName ?? item.name ?? item.id,
            );
            const detail = String(
              item.contractNumber ??
                item.status ??
                (item.expiryDate
                  ? new Date(String(item.expiryDate)).toLocaleDateString()
                  : item.createdAt
                    ? new Date(String(item.createdAt)).toLocaleDateString()
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
