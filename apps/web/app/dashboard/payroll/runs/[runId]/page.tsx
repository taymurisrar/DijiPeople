import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import {
  PayrollJournalRecord,
  PayrollRunRecord,
  PayslipRecord,
  TimePayrollInputRecord,
} from "../../payroll-run-types";
import { PayrollRunActions } from "./_components/payroll-run-actions";

type PageProps = { params: Promise<{ runId: string }> };

export default async function PayrollRunDetailPage({ params }: PageProps) {
  const { runId } = await params;
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYROLL_RUNS_READ)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to payroll runs."
      />
    );
  }
  const run = await apiRequestJson<PayrollRunRecord>(`/payroll/runs/${runId}`);
  const canReadPayslips = hasPermission(
    user.permissionKeys,
    PERMISSION_KEYS.PAYSLIPS_READ_ALL,
  );
  const payslips = canReadPayslips
    ? await apiRequestJson<PayslipRecord[]>(`/payslips?payrollRunId=${runId}`)
    : [];
  const canReadTimeInputs = hasPermission(
    user.permissionKeys,
    PERMISSION_KEYS.PAYROLL_TIME_INPUTS_READ,
  );
  const timeInputs = canReadTimeInputs
    ? await apiRequestJson<TimePayrollInputRecord[]>(
        `/payroll/runs/${runId}/time-inputs`,
      )
    : [];
  const canReadJournal = hasPermission(
    user.permissionKeys,
    PERMISSION_KEYS.PAYROLL_JOURNAL_READ,
  );
  const journal = canReadJournal
    ? await apiRequestJson<PayrollJournalRecord>(
        `/payroll/runs/${runId}/journal`,
      ).catch(() => null)
    : null;
  const payslipByEmployeeRun = new Map(
    payslips.map((payslip) => [payslip.payrollRunEmployeeId, payslip]),
  );
  const employees = run.employees ?? [];
  const exceptions = run.exceptions ?? [];
  const leaveDeductionLines = employees.flatMap((employee) =>
    employee.lineItems.filter(
      (line) => line.sourceType === "LEAVE" && line.category === "DEDUCTION",
    ),
  );
  const totals = employees.reduce(
    (sum, employee) => sum + Number(employee.netPay),
    0,
  );
  const leaveDeductionTotal = leaveDeductionLines.reduce(
    (sum, line) => sum + Number(line.amount),
    0,
  );
  const reimbursementTotal = employees.reduce(
    (sum, employee) => sum + Number(employee.totalReimbursements),
    0,
  );
  const taxTotal = employees.reduce(
    (sum, employee) => sum + Number(employee.totalTaxes),
    0,
  );
  const employerContributionTotal = employees.reduce(
    (sum, employee) => sum + Number(employee.employerContributions),
    0,
  );
  const timeSummary = timeInputs.reduce(
    (sum, input) => ({
      regularHours: sum.regularHours + Number(input.regularHours),
      overtimeHours: sum.overtimeHours + Number(input.overtimeHours),
      noShowDays: sum.noShowDays + Number(input.absenceDays),
    }),
    { regularHours: 0, overtimeHours: 0, noShowDays: 0 },
  );
  const noShowDeductionTotal = employees
    .flatMap((employee) =>
      employee.lineItems.filter((line) => line.sourceType === "NO_SHOW"),
    )
    .reduce((sum, line) => sum + Number(line.amount), 0);
  const overtimeEarningsTotal = employees
    .flatMap((employee) =>
      employee.lineItems.filter((line) => line.sourceType === "OVERTIME"),
    )
    .reduce((sum, line) => sum + Number(line.amount), 0);
  const taxLineItems = employees.flatMap((employee) =>
    employee.lineItems
      .filter((line) =>
        ["TAX", "EMPLOYER_CONTRIBUTION"].includes(line.category),
      )
      .map((line) => ({ employee, line })),
  );
  return (
    <PayrollLayoutShell
      title={`Payroll Run #${run.runNumber}`}
      description={`${run.payrollPeriod?.name ?? "Payroll period"} / ${run.status}`}
    >
      <section className="grid gap-6">
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="grid gap-3 md:grid-cols-4">
              <Summary label="Status" value={run.status} />
              <Summary label="Employees" value={`${employees.length}`} />
              <Summary label="Exceptions" value={`${exceptions.length}`} />
              <Summary label="Net pay" value={totals.toFixed(2)} />
              <Summary
                label="Leave deductions"
                value={`${leaveDeductionLines.length} / ${leaveDeductionTotal.toFixed(2)}`}
              />
              <Summary
                label="Reimbursements"
                value={reimbursementTotal.toFixed(2)}
              />
              <Summary label="Taxes" value={taxTotal.toFixed(2)} />
              <Summary
                label="Employer contributions"
                value={employerContributionTotal.toFixed(2)}
              />
              <Summary
                label="Regular hours"
                value={timeSummary.regularHours.toFixed(2)}
              />
              <Summary
                label="Overtime"
                value={`${timeSummary.overtimeHours.toFixed(2)}h / ${overtimeEarningsTotal.toFixed(2)}`}
              />
              <Summary
                label="No-show"
                value={`${timeSummary.noShowDays.toFixed(2)}d / ${noShowDeductionTotal.toFixed(2)}`}
              />
            </div>
            <PayrollRunActions
              runId={run.id}
              status={run.status}
              canCalculate={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYROLL_RUNS_CALCULATE,
              )}
              canLock={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYROLL_RUNS_LOCK,
              )}
              canGeneratePayslips={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYSLIPS_MANAGE,
              )}
              canPrepareTimeInputs={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYROLL_TIME_INPUTS_PREPARE,
              )}
              canCalculateTaxes={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYROLL_TAX_CALCULATE,
              )}
              canExportJournal={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYROLL_JOURNAL_EXPORT,
              )}
              canGenerateJournal={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYROLL_JOURNAL_GENERATE,
              )}
              canMarkJournalExported={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYROLL_JOURNAL_EXPORT,
              )}
              journalStatus={journal?.status}
            />
          </div>
        </article>
        {canReadJournal ? (
          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Journal summary
                </h3>
                <p className="mt-1 text-sm text-muted">
                  GL journal generated from payroll run line items.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Summary label="Status" value={journal?.status ?? "Not generated"} />
                <Summary label="Lines" value={`${journal?.lines.length ?? 0}`} />
                <Summary
                  label="Number"
                  value={journal?.journalNumber ?? "Pending"}
                />
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-surface-strong text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 text-right font-medium">Debit</th>
                    <th className="px-4 py-3 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {journal?.lines.length ? (
                    journal.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3">
                          {line.account.code} / {line.account.name}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {line.employee?.employeeCode ?? "Run"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {line.description ?? ""}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {line.debitAmount}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {line.creditAmount}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                        No payroll journal has been generated yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
        {canReadTimeInputs ? (
          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-foreground">
              Time inputs
            </h3>
            <div className="mt-4 grid gap-3">
              {timeInputs.length ? (
                timeInputs.slice(0, 20).map((input) => (
                  <div
                    className="rounded-2xl border border-border bg-white p-4 text-sm"
                    key={input.id}
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <p className="font-semibold text-foreground">
                        {input.employee?.employeeCode ?? "Employee"} /{" "}
                        {input.sourceType}
                      </p>
                      <p className="text-muted">
                        {new Date(input.workDate).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="mt-1 text-muted">
                      Regular {input.regularHours}h / Overtime{" "}
                      {input.overtimeHours}h / Absence {input.absenceDays}d
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">
                  No time payroll inputs prepared for this run.
                </p>
              )}
            </div>
          </article>
        ) : null}
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                Tax line items
              </h3>
              <p className="mt-1 text-sm text-muted">
                Employee taxes and employer contributions generated from tax
                rules.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Summary label="Taxes" value={taxTotal.toFixed(2)} />
              <Summary
                label="Employer"
                value={employerContributionTotal.toFixed(2)}
              />
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {taxLineItems.length ? (
                  taxLineItems.map(({ employee, line }) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3">
                        {employee.employee?.employeeCode ?? employee.employeeId}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {line.label}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {line.category === "TAX"
                          ? "Employee tax"
                          : "Employer contribution"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {line.sourceType ?? "TaxRule"}{" "}
                        {line.sourceId ? line.sourceId.slice(0, 8) : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {line.currencyCode} {line.amount}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                      No tax line items generated for this run.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-foreground">
            Employee results
          </h3>
          <div className="mt-4 grid gap-3">
            {employees.map((employee) => (
              <div
                className="rounded-2xl border border-border bg-white p-4"
                key={employee.id}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {employee.employee?.firstName}{" "}
                      {employee.employee?.lastName}
                    </p>
                    <p className="text-sm text-muted">
                      {employee.employee?.employeeCode} / {employee.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {employee.currencyCode} {employee.netPay}
                    </p>
                    {payslipByEmployeeRun.get(employee.id) ? (
                      <a
                        className="text-sm font-medium text-accent"
                        href={`/dashboard/payroll/payslips/${payslipByEmployeeRun.get(employee.id)?.id}`}
                      >
                        View payslip
                      </a>
                    ) : null}
                  </div>
                </div>
                {employee.lineItems.length ? (
                  <div className="mt-3 grid gap-2 text-sm text-muted">
                    {employee.lineItems.map((line) => (
                      <p key={line.id}>
                        {line.category}: {line.label} / {line.currencyCode}{" "}
                        {line.amount}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-foreground">Exceptions</h3>
          <div className="mt-4 grid gap-3">
            {exceptions.length ? (
              exceptions.map((exception) => (
                <div
                  className="rounded-2xl border border-border bg-white p-4 text-sm"
                  key={exception.id}
                >
                  <p className="font-semibold text-foreground">
                    {exception.severity} / {exception.errorType}
                  </p>
                  <p className="text-muted">
                    {exception.employee?.employeeCode ?? "Run"}:{" "}
                    {exception.message}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No exceptions recorded.</p>
            )}
          </div>
        </article>
      </section>
    </PayrollLayoutShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}
