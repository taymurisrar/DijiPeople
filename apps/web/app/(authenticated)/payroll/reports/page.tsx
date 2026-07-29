import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import { PayrollRunRecord } from "../payroll-run-types";

type PageProps = {
  searchParams?: Promise<{
    reportType?: string;
    payrollRunId?: string;
    currency?: string;
    status?: string;
    search?: string;
    page?: string;
  }>;
};

const reportTypes = [
  ["payroll-register", "Payroll Register"],
  ["employee-net-pay", "Employee Net Pay"],
  ["component-summary", "Pay Component Summary"],
  ["bank-payment", "Bank Payment Report"],
  ["tax-summary", "Tax Summary"],
  ["loan-deduction", "Loan Deduction Report"],
  ["benefit-summary", "Benefit Summary"],
  ["claims-reimbursement", "Claims/Reimbursement Report"],
  ["project-cost", "Project/Customer Payroll Cost"],
  ["gl-journal", "GL Journal Report"],
  ["exceptions", "Payroll Exceptions Report"],
  ["multi-currency", "Multi-Currency Payroll Summary"],
] as const;

type ReportResponse = {
  reportType: string;
  columns: string[];
  items: Record<string, string | number | boolean | null>[];
  meta: { page: number; pageSize: number; total: number };
};

export default async function PayrollReportsPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYROLL_RUNS_READ)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to payroll reports."
      />
    );
  }

  const params = (await searchParams) ?? {};
  const reportType = params.reportType ?? "payroll-register";
  const query = new URLSearchParams();
  query.set("reportType", reportType);
  for (const key of ["payrollRunId", "currency", "status", "search", "page"] as const) {
    if (params[key]) query.set(key, params[key] as string);
  }

  const [runs, report] = await Promise.all([
    apiRequestJson<PayrollRunRecord[]>("/payroll/runs").catch(() => []),
    apiRequestJson<ReportResponse>(`/payroll/operations/reports?${query}`).catch(
      () => ({
        reportType,
        columns: [],
        items: [],
        meta: { page: 1, pageSize: 25, total: 0 },
      }),
    ),
  ]);

  return (
    <PayrollLayoutShell
      title="Payroll Reports"
      description="Snapshot-based payroll reports with filters and CSV export."
    >
      <section className="grid gap-6">
        <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-5">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Report</span>
            <select className="rounded-xl border border-border bg-white px-3 py-2" name="reportType" defaultValue={reportType}>
              {reportTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Payroll Run</span>
            <select className="rounded-xl border border-border bg-white px-3 py-2" name="payrollRunId" defaultValue={params.payrollRunId ?? ""}>
              <option value="">All runs</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  #{run.runNumber} / {run.payrollPeriod?.name ?? run.status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Currency</span>
            <input className="rounded-xl border border-border bg-white px-3 py-2" name="currency" defaultValue={params.currency ?? ""} placeholder="PKR, USD" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Status</span>
            <input className="rounded-xl border border-border bg-white px-3 py-2" name="status" defaultValue={params.status ?? ""} placeholder="APPROVED, PAID" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">Search</span>
            <input className="rounded-xl border border-border bg-white px-3 py-2" name="search" defaultValue={params.search ?? ""} placeholder="Employee or code" />
          </label>
          <div className="flex flex-wrap items-end gap-2 md:col-span-5">
            <button className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white" type="submit">
              Run Report
            </button>
            <a className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground" href={`/api/payroll/operations/reports/export?${query}`}>
              Export CSV
            </a>
          </div>
        </form>

        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                {reportTypes.find(([value]) => value === report.reportType)?.[1] ?? "Payroll Report"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {report.meta.total} records from payroll snapshot data.
              </p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  {report.columns.map((column) => (
                    <th className="px-4 py-3 font-medium" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.items.length ? (
                  report.items.map((item, index) => (
                    <tr key={index}>
                      {report.columns.map((column) => (
                        <td className="px-4 py-3" key={column}>
                          {String(item[columnKey(column)] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted" colSpan={Math.max(report.columns.length, 1)}>
                      No report rows match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </PayrollLayoutShell>
  );
}

function columnKey(column: string) {
  return column
    .replace(/ %/g, "Percentage")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}
