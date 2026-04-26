import { apiRequestJson } from "@/lib/server-api";
import { TenantResolvedSettingsResponse } from "@/app/dashboard/settings/types";
import { PayrollCycleActions } from "../../_components/payroll-cycle-actions";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import { PayrollCycleStatusBadge } from "../../_components/payroll-cycle-status-badge";
import { PayrollRecordStatusBadge } from "../../_components/payroll-record-status-badge";
import { PayrollCycleRecord, PayrollGenerationPreview } from "../../types";

export default async function PayrollCycleDetailPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  const [cycle, resolvedSettings, preview] = await Promise.all([
    apiRequestJson<PayrollCycleRecord>(`/payroll/cycles/${cycleId}`),
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved"),
    apiRequestJson<PayrollGenerationPreview>(`/payroll/cycles/${cycleId}/preview`),
  ]);

  return (
    <PayrollLayoutShell
      description="Preview approved timesheet readiness, generate draft payroll, review the records, finalize, and export payroll-ready data."
      title="Payroll Cycle Detail"
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
            <span>Business unit: {cycle.businessUnit?.name ?? "Tenant-wide"}</span>
            <span>Source: {resolvedSettings.payroll.payrollGenerationSource.replaceAll("_", " ")}</span>
          </div>
        </div>

        <PayrollCycleActions
          cycleId={cycle.id}
          status={cycle.status}
          recordCount={cycle.counts.records}
          blockedEmployees={preview.summary.blockedEmployees}
          requireApprovedTimesheets={
            resolvedSettings.payroll.requireApprovedTimesheetsForPayroll
          }
        />
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        {[
          ["Employees in scope", preview.summary.employeesInScope],
          ["Eligible", preview.summary.eligibleEmployees],
          ["Approved timesheets", preview.summary.approvedTimesheets],
          ["Missing timesheets", preview.summary.missingTimesheets],
          ["Blocked", preview.summary.blockedEmployees],
        ].map(([label, value]) => (
          <div
            className="rounded-[16px] border border-border bg-surface p-4 shadow-sm"
            key={label}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h4 className="font-semibold text-foreground">Payroll readiness preview</h4>
          <p className="mt-1 text-sm text-muted">
            Approved timesheet totals are carried into draft payroll as traceable inputs.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-strong text-left text-muted">
              <tr>
                <th className="px-5 py-4 font-medium">Employee</th>
                <th className="px-5 py-4 font-medium">Readiness</th>
                <th className="px-5 py-4 font-medium">Timesheet summary</th>
                <th className="px-5 py-4 font-medium">Payroll inputs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/90">
              {[...preview.eligibleEmployees, ...preview.blockedEmployees].map(
                (item) => (
                  <tr key={item.employee.id} className="align-top hover:bg-accent-soft/30">
                    <td className="px-5 py-4">
                      <p className="font-medium text-foreground">{item.employee.fullName}</p>
                      <p className="mt-1 text-muted">{item.employee.employeeCode}</p>
                      <p className="mt-1 text-muted">
                        {[item.employee.department?.name, item.employee.businessUnit?.name]
                          .filter(Boolean)
                          .join(" / ") || "No department or business unit"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {item.reason ? (
                        <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
                          Blocked
                        </span>
                      ) : (
                        <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                          Ready
                        </span>
                      )}
                      {item.reason ? (
                        <p className="mt-2 max-w-xs text-xs text-muted">{item.reason}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {item.timesheetSummary ? (
                        <div className="space-y-1">
                          <p>{item.timesheetSummary.totalWorkDays} work day(s), {item.timesheetSummary.totalLeaveDays} leave day(s)</p>
                          <p>{item.timesheetSummary.totalHolidayDays} holiday(s), {item.timesheetSummary.totalWeekendWorkDays} weekend work day(s)</p>
                          <p>{item.timesheetSummary.totalHours.toFixed(2)} hour(s)</p>
                        </div>
                      ) : (
                        "No approved timesheet"
                      )}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {item.calculatedPayroll ? (
                        <div className="space-y-1">
                          <p>Gross: {item.calculatedPayroll.gross}</p>
                          <p>Deductions: {item.calculatedPayroll.deductions}</p>
                          <p>Net: {item.calculatedPayroll.net}</p>
                        </div>
                      ) : (
                        "Not calculated"
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {cycle.records.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            No payroll records yet
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Generate draft payroll from approved timesheets and active compensation.
          </h4>
          <p className="mt-3 text-muted">
            The preview above shows ready employees and any blockers before payroll records are created.
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
                  <th className="px-5 py-4 font-medium">Timesheet source</th>
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
                    <td className="px-5 py-4 text-muted">
                      {record.timesheetSummary ? (
                        <div className="space-y-1 text-xs">
                          <p>{record.timesheetSummary.totalHours.toFixed(2)} hrs</p>
                          <p>
                            {record.timesheetSummary.totalWorkDays} work,{" "}
                            {record.timesheetSummary.totalLeaveDays} leave
                          </p>
                          <p>
                            {record.sourceTimesheetIds?.length ?? 0} approved source(s)
                          </p>
                        </div>
                      ) : (
                        "Manual or no timesheet source"
                      )}
                    </td>
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
