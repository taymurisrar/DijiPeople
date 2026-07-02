import { DashboardSectionRenderer } from "@/app/components/dashboard/dashboard-section-renderer";
import type { DashboardSection } from "@/app/components/dashboard/types";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../../_components/access-denied-state";
import { PayrollLayoutShell } from "../../../_components/payroll-layout-shell";
import { PayrollPreviewTable, type PayrollPreviewEmployee } from "./_components/payroll-preview-table";

type Preview = {
  runId: string;
  status: string;
  currencyCode: string;
  totals: Record<string, number>;
  employees: PayrollPreviewEmployee[];
  byDepartment: Array<Record<string, string | number>>;
  byBusinessUnit: Array<Record<string, string | number>>;
  byLegalEntity: Array<Record<string, string | number>>;
};

export default async function PayrollPreviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const [{ runId }, user] = await Promise.all([params, getSessionUser()]);
  if (!user || !hasPermission(user.permissionKeys, "payroll-runs.read")) return <AccessDeniedState title="Access denied" description="Payroll preview access is required." />;
  const preview = await apiRequestJson<Preview>(`/payroll/operations/runs/${runId}/preview`);
  const totals: DashboardSection = {
    key: "totals",
    title: "Payroll totals",
    layout: "grid",
    order: 10,
    widgets: Object.entries(preview.totals).map(([key, value], index) => ({ key, title: key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), type: "metric-card", order: index, value: `${preview.currencyCode} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` })),
  };
  const aggregation: DashboardSection = {
    key: "aggregation",
    title: "Cost aggregation",
    description: "Net salary by organization dimension.",
    layout: "grid",
    order: 20,
    widgets: [
      chart("department", "By Department", preview.byDepartment),
      chart("business-unit", "By Business Unit", preview.byBusinessUnit),
      chart("legal-entity", "By Legal Entity", preview.byLegalEntity),
    ],
  };
  return (
    <PayrollLayoutShell title="Payroll Preview" description={`Frozen calculated values / ${preview.status}`}>
      <div className="grid gap-8">
        <DashboardSectionRenderer section={totals} />
        <DashboardSectionRenderer section={aggregation} />
        <section className="grid gap-4"><div><h2 className="text-lg font-semibold">Employee drill-down</h2><p className="text-sm text-muted">Search, sort, filter, and inspect calculated line items.</p></div><PayrollPreviewTable employees={preview.employees} /></section>
      </div>
    </PayrollLayoutShell>
  );
}

function chart(key: string, title: string, values: Array<Record<string, string | number>>) {
  return { key, title, type: "chart" as const, order: 10, data: { rows: values.map((row) => ({ label: String(row.label), value: Number(row.netSalary ?? 0) })) } };
}
