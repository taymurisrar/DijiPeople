import { apiRequestJson } from "@/lib/server-api";
import { GeneratePayrollDraftsButton } from "../../_components/generate-payroll-drafts-button";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import { PayrollCycleStatusBadge } from "../../_components/payroll-cycle-status-badge";
import { PayrollRecordStatusBadge } from "../../_components/payroll-record-status-badge";
import { PayrollCycleRecord } from "../../types";

export default async function PayrollCycleDetailPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  const cycle = await apiRequestJson<PayrollCycleRecord>(`/payroll/cycles/${cycleId}`);

  return (
    <PayrollLayoutShell
      description="Draft payroll details show the structural record set for a cycle so future calculation, review, export, and payslip flows have a stable base."
      title="Payroll Draft Detail"
    >
      <section className="flex flex-col gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Cycle window
          </p>
          <h3 className="text-2xl font-semibold text-foreground">
            {new Date(cycle.periodStart).toLocaleDateString()} - {new Date(cycle.periodEnd).toLocaleDateString()}
          </h3>
          <div className="flex flex-wrap gap-3 text-sm text-muted">
            <PayrollCycleStatusBadge status={cycle.status} />
            <span>Run date: {cycle.runDate ? new Date(cycle.runDate).toLocaleDateString() : "Not generated yet"}</span>
            <span>Draft records: {cycle.counts.records}</span>
          </div>
        </div>

        <GeneratePayrollDraftsButton cycleId={cycle.id} />
      </section>

      {cycle.records.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            No payroll records yet
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Generate draft records from active employee compensation.
          </h4>
          <p className="mt-3 text-muted">
            The draft run will create simple gross, deductions, and net placeholders from the current compensation setup.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Employee</th>
                  <th className="px-5 py-4 font-medium">Gross</th>
                  <th className="px-5 py-4 font-medium">Deductions</th>
                  <th className="px-5 py-4 font-medium">Net</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {cycle.records.map((record) => (
                  <tr key={record.id} className="align-top hover:bg-accent-soft/30">
                    <td className="px-5 py-4">
                      <p className="font-medium text-foreground">{record.employee.fullName}</p>
                      <p className="mt-1 text-muted">{record.employee.employeeCode}</p>
                      <p className="mt-1 text-muted">
                        {record.employee.department?.name ?? "No department"} · {record.employee.designation?.name ?? "No designation"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-foreground">{record.gross}</td>
                    <td className="px-5 py-4 text-foreground">{record.deductions}</td>
                    <td className="px-5 py-4 text-foreground">{record.net}</td>
                    <td className="px-5 py-4">
                      <PayrollRecordStatusBadge status={record.status} />
                      {record.lineItems && record.lineItems.length > 0 ? (
                        <div className="mt-3 space-y-1 text-xs text-muted">
                          {record.lineItems.map((item) => (
                            <p key={`${record.id}-${item.code}`}>
                              {item.label}: {item.amount}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PayrollLayoutShell>
  );
}

