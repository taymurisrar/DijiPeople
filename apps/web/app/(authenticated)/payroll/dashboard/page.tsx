import Link from "next/link";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/formatting-context";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

type Dashboard = {
  latestRunId: string | null;
  widgets: {
    payrollRuns: number;
    readyEmployees: number;
    blockedEmployees: number;
    missingBankAccounts: number;
    missingCompensation: number;
    missingTaxProfiles: number;
    pendingClaims: number;
    pendingLoans: number;
    attendanceExceptions: number;
    payrollCostTrend: MoneySummary[];
    payrollCostByDepartment: MoneySummary[];
    payrollCostByBusinessUnit: MoneySummary[];
    payslipDeliveryStatus: { pending: number; sent: number; failed: number };
  };
};

type MoneySummary = {
  label: string;
  value: number;
  currencyCode: string;
};

export default async function PayrollDashboardPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, "payroll-operations.dashboard")
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to the payroll operations dashboard."
      />
    );
  }
  const data = await apiRequestJson<Dashboard>("/payroll/operations/dashboard");
  const operationalCards = [
    ["Runs", data.widgets.payrollRuns],
    ["Ready employees", data.widgets.readyEmployees],
    ["Blocked employees", data.widgets.blockedEmployees],
    ["Missing bank accounts", data.widgets.missingBankAccounts],
    ["Missing compensation", data.widgets.missingCompensation],
    ["Tax issues", data.widgets.missingTaxProfiles],
    ["Pending claims", data.widgets.pendingClaims],
    ["Pending loans", data.widgets.pendingLoans],
    ["Time exceptions", data.widgets.attendanceExceptions],
  ] as const;

  return (
    <PayrollLayoutShell
      title="Payroll overview"
      description="A compact operational view of payroll readiness, exceptions, cost, and delivery."
    >
      <div className="grid gap-4">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {operationalCards.map(([label, value]) => (
            <article
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
              key={label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {value}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <SummaryList
            items={data.widgets.payrollCostTrend}
            title="Recent payroll cost"
          />
          <SummaryList
            items={data.widgets.payrollCostByDepartment}
            title="Cost by department"
          />
          <SummaryList
            items={data.widgets.payrollCostByBusinessUnit}
            title="Cost by business unit"
          />
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div>
            <h2 className="font-semibold text-foreground">Payslip delivery</h2>
            <p className="mt-1 text-sm text-muted">
              {data.widgets.payslipDeliveryStatus.sent} sent ·{" "}
              {data.widgets.payslipDeliveryStatus.pending} pending ·{" "}
              {data.widgets.payslipDeliveryStatus.failed} failed
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold"
              href="/payroll/exceptions"
            >
              Open exceptions
            </Link>
            <Link
              className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white"
              href={
                data.latestRunId
                  ? `/payroll/runs/${data.latestRunId}`
                  : "/payroll/runs/new"
              }
            >
              {data.latestRunId ? "Open latest run" : "Create payroll run"}
            </Link>
          </div>
        </section>
      </div>
    </PayrollLayoutShell>
  );
}

function SummaryList({
  items,
  title,
}: {
  items: MoneySummary[];
  title: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid gap-2">
        {items.length ? (
          items.slice(-6).map((item, index) => (
            <div
              className="flex items-center justify-between gap-3 text-sm"
              key={`${item.label}-${item.currencyCode}-${index}`}
            >
              <span className="truncate text-muted">{item.label}</span>
              <span className="font-semibold text-foreground">
                {formatMoney(item.value, item.currencyCode)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No calculated payroll data yet.</p>
        )}
      </div>
    </article>
  );
}
