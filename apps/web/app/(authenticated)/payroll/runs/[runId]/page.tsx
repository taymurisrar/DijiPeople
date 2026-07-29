import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import {
  formatDate,
  formatMoney,
  formatNumber,
} from "@/lib/formatting-context";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import {
  PayrollCostAllocationListResponse,
  PayrollJournalRecord,
  PayrollAdjustmentRecord,
  PayrollPaymentBatchRecord,
  PayrollRunRecord,
  PayslipRecord,
  TimePayrollInputRecord,
} from "../../payroll-run-types";
import { PayrollPaymentsWorkspace } from "./_components/payroll-payments-workspace";
import { PayrollExceptionActions } from "./_components/payroll-exception-actions";
import { PayrollRunActions } from "./_components/payroll-run-actions";

type PageProps = {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

const tabs = [
  { key: "summary", label: "Summary" },
  { key: "employees", label: "Employees" },
  { key: "inputs", label: "Inputs" },
  { key: "adjustments", label: "Adjustments" },
  { key: "exceptions", label: "Exceptions" },
  { key: "payslips", label: "Payslips" },
  { key: "payments", label: "Payments" },
  { key: "cost-allocation", label: "Cost Allocation" },
  { key: "journal", label: "Journal Entries" },
] as const;

type PayrollRunTab = (typeof tabs)[number]["key"];

export default async function PayrollRunDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { runId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedTab = resolvedSearchParams.tab;
  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? (requestedTab as PayrollRunTab)
    : "summary";
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
  const lifecycle = await apiRequestJson<{
    status: string;
    blockers: number;
    warnings: number;
    steps: Array<{
      label: string;
      status: string;
      completedAt?: string | null;
    }>;
  }>(`/payroll/operations/runs/${runId}/lifecycle`);
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
  const journals = canReadJournal
    ? await apiRequestJson<PayrollJournalRecord[]>(
        `/payroll/runs/${runId}/journals`,
      ).catch(() => [])
    : [];
  const journal =
    journals.find((item) => item.journalType === "ORIGINAL") ??
    journals[0] ??
    null;
  const adjustments = await apiRequestJson<PayrollAdjustmentRecord[]>(
    `/payroll/runs/${runId}/adjustments`,
  ).catch(() => []);
  const paymentBatches = await apiRequestJson<PayrollPaymentBatchRecord[]>(
    `/payroll/operations/runs/${runId}/payment-batches`,
  ).catch(() => []);
  const costAllocations =
    await apiRequestJson<PayrollCostAllocationListResponse>(
      `/payroll/runs/${runId}/cost-allocations?page=1&pageSize=50`,
    ).catch(() => ({
      items: [],
      meta: { page: 1, pageSize: 50, total: 0, pageCount: 0 },
    }));
  const payslipByEmployeeRun = new Map(
    payslips.map((payslip) => [payslip.payrollRunEmployeeId, payslip]),
  );
  const employees = run.employees ?? [];
  const exceptions = run.exceptions ?? [];
  const runCurrencyCode =
    employees[0]?.currencyCode ?? payslips[0]?.currencyCode;
  const formatRunMoney = (amount: number | string | null | undefined) =>
    formatMoney(amount, runCurrencyCode);
  const canResolveExceptions = hasPermission(
    user.permissionKeys,
    PERMISSION_KEYS.PAYROLL_RUNS_CALCULATE,
  );
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
  const activePaymentLines = paymentBatches.flatMap((batch) =>
    batch.status === "CANCELLED" ? [] : batch.paymentLines,
  );
  const paymentSummary = {
    totalLines: activePaymentLines.length,
    disbursedLines: activePaymentLines.filter(
      (line) => line.status === "DISBURSED",
    ).length,
    failedLines: activePaymentLines.filter((line) => line.status === "FAILED")
      .length,
    pendingLines: activePaymentLines.filter(
      (line) => !["DISBURSED", "FAILED", "CANCELLED"].includes(line.status),
    ).length,
    hasBankExport: paymentBatches.some((batch) => batch.status !== "CANCELLED"),
  };
  const completedStepCount = lifecycle.steps.filter(
    (step) => step.status === "COMPLETED",
  ).length;
  const nextStepIndex = lifecycle.steps.findIndex(
    (step) => step.status !== "COMPLETED",
  );
  const nextStep =
    nextStepIndex >= 0 ? lifecycle.steps[nextStepIndex] : undefined;
  const progressPercent = lifecycle.steps.length
    ? Math.round((completedStepCount / lifecycle.steps.length) * 100)
    : 0;

  return (
    <PayrollLayoutShell
      title={`Payroll Run #${run.runNumber}`}
      description={`${run.payrollPeriod?.name ?? "Payroll period"} / ${run.status}`}
    >
      <section className="grid gap-6">
        <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <div className="grid gap-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Current step
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">
                  {nextStep
                    ? `Step ${nextStepIndex + 1}: ${nextStep.label}`
                    : "Payroll run complete"}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {nextStep
                    ? `${completedStepCount} of ${lifecycle.steps.length} lifecycle steps are complete.`
                    : "All lifecycle steps are complete for this run."}
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-strong">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <div className="grid gap-2 rounded-lg border border-border bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Run status
                  </p>
                  <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground">
                    {run.status}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {run.payrollPeriod?.name ?? "Payroll period"}
                </p>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Summary label="Employees" value={`${employees.length}`} />
                  <Summary label="Net pay" value={formatRunMoney(totals)} />
                  <Summary label="Blockers" value={`${lifecycle.blockers}`} />
                  <Summary label="Warnings" value={`${lifecycle.warnings}`} />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Next actions
              </p>
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
                canFinalize={hasPermission(
                  user.permissionKeys,
                  "payroll-runs.finalize",
                )}
                canGenerateBankExport={hasPermission(
                  user.permissionKeys,
                  "payroll-bank-export.generate",
                )}
                canDisburse={hasPermission(
                  user.permissionKeys,
                  "payroll-runs.disburse",
                )}
                journalStatus={journal?.status}
                paymentSummary={paymentSummary}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Exceptions" value={`${exceptions.length}`} />
              <Summary
                label="Payment lines"
                value={`${paymentSummary.disbursedLines} / ${paymentSummary.totalLines}`}
              />
              <Summary label="Payslips" value={`${payslips.length}`} />
            </div>
          </div>
        </article>
        <nav className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm">
          {tabs.map((tab) => (
            <a
              className={`rounded-2xl border px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "border-accent/30 bg-accent text-white"
                  : "border-border bg-white text-muted hover:border-accent/30 hover:text-foreground"
              }`}
              href={`/payroll/runs/${runId}?tab=${tab.key}`}
              key={tab.key}
            >
              {tab.label}
            </a>
          ))}
        </nav>
        {activeTab === "summary" ? (
          <>
            <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Payroll lifecycle
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Prepare - Validate - Preview - Finalize - Payslips - Bank
                    Export - Disburse
                  </p>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="rounded-full border border-border px-3 py-1">
                    {lifecycle.blockers} blockers
                  </span>
                  <span className="rounded-full border border-border px-3 py-1">
                    {lifecycle.warnings} warnings
                  </span>
                </div>
              </div>
              <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
                {lifecycle.steps.map((step, index) => (
                  <WorkflowStepCard
                    index={index}
                    isCurrent={nextStep?.label === step.label}
                    key={step.label}
                    label={step.label}
                    status={step.status}
                  />
                ))}
              </ol>
            </article>
            <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Payroll totals
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Calculated money, time, deductions, and payment readiness
                    for this run.
                  </p>
                </div>
                <Summary label="Run status" value={run.status} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Summary
                  label="Leave deductions"
                  value={`${leaveDeductionLines.length} / ${formatRunMoney(leaveDeductionTotal)}`}
                />
                <Summary
                  label="Reimbursements"
                  value={formatRunMoney(reimbursementTotal)}
                />
                <Summary label="Taxes" value={formatRunMoney(taxTotal)} />
                <Summary
                  label="Employer contributions"
                  value={formatRunMoney(employerContributionTotal)}
                />
                <Summary
                  label="Regular hours"
                  value={timeSummary.regularHours.toFixed(2)}
                />
                <Summary
                  label="Overtime"
                  value={`${timeSummary.overtimeHours.toFixed(2)}h / ${formatRunMoney(overtimeEarningsTotal)}`}
                />
                <Summary
                  label="No-show"
                  value={`${timeSummary.noShowDays.toFixed(2)}d / ${formatRunMoney(noShowDeductionTotal)}`}
                />
                <Summary
                  label="Pending payments"
                  value={`${paymentSummary.pendingLines}`}
                />
              </div>
            </article>
          </>
        ) : null}
        {activeTab === "journal" && canReadJournal ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
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
                <Summary
                  label="Status"
                  value={journal?.status ?? "Not generated"}
                />
                <Summary label="Journals" value={`${journals.length}`} />
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
                    <th className="px-4 py-3 font-medium">Journal Number</th>
                    <th className="px-4 py-3 font-medium">Journal Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Original Journal</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Debit Total
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Credit Total
                    </th>
                    <th className="px-4 py-3 font-medium">Balanced</th>
                    <th className="px-4 py-3 font-medium">Generated At</th>
                    <th className="px-4 py-3 font-medium">Posted At</th>
                    <th className="px-4 py-3 font-medium">Reversed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {journals.length ? (
                    journals.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {item.journalNumber ?? item.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">{item.journalType}</td>
                        <td className="px-4 py-3">{item.status}</td>
                        <td className="px-4 py-3 text-muted">
                          {item.originalJournalId
                            ? (journals.find(
                                (candidate) =>
                                  candidate.id === item.originalJournalId,
                              )?.journalNumber ??
                              item.originalJournalId.slice(0, 8))
                            : ""}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatNumber(item.debitTotal ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatNumber(item.creditTotal ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          {item.balanced ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {item.generatedAt ? formatDate(item.generatedAt) : ""}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {item.postedAt ? formatDate(item.postedAt) : ""}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {item.reversedAt ? formatDate(item.reversedAt) : ""}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted"
                        colSpan={10}
                      >
                        No payroll journal has been generated yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                          {formatNumber(line.debitAmount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatNumber(line.creditAmount)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted"
                        colSpan={5}
                      >
                        No payroll journal has been generated yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
        {activeTab === "adjustments" ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Adjustments
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Manual payroll inputs included only after approval.
                </p>
              </div>
              <Summary label="Records" value={`${adjustments.length}`} />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-surface-strong text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Component</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {adjustments.length ? (
                    adjustments.map((adjustment) => (
                      <tr key={adjustment.id}>
                        <td className="px-4 py-3">
                          {adjustment.employeeName ??
                            adjustment.employeeCode ??
                            adjustment.employeeId}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {adjustment.payComponent?.name ?? adjustment.label}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {adjustment.reason ?? ""}
                        </td>
                        <td className="px-4 py-3">{adjustment.status}</td>
                        <td className="px-4 py-3 text-right">
                          {formatMoney(
                            adjustment.amount,
                            adjustment.currencyCode,
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted"
                        colSpan={5}
                      >
                        No manual adjustments for this run.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
        {activeTab === "payments" ? (
          <PayrollPaymentsWorkspace
            batches={paymentBatches}
            canDisburse={hasPermission(
              user.permissionKeys,
              "payroll-runs.disburse",
            )}
            canGenerateBankExport={hasPermission(
              user.permissionKeys,
              "payroll-bank-export.generate",
            )}
            runId={runId}
          />
        ) : null}
        {activeTab === "inputs" && canReadTimeInputs ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
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
                      <p className="text-muted">{formatDate(input.workDate)}</p>
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
        {activeTab === "inputs" ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
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
                <Summary label="Taxes" value={formatRunMoney(taxTotal)} />
                <Summary
                  label="Employer"
                  value={formatRunMoney(employerContributionTotal)}
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
                          {employee.employee?.employeeCode ??
                            employee.employeeId}
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
                          {formatMoney(line.amount, line.currencyCode)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted"
                        colSpan={5}
                      >
                        No tax line items generated for this run.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
        {activeTab === "employees" ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
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
                        {formatMoney(employee.netPay, employee.currencyCode)}
                      </p>
                      {payslipByEmployeeRun.get(employee.id) ? (
                        <a
                          className="text-sm font-medium text-accent"
                          href={`/payroll/payslips/${payslipByEmployeeRun.get(employee.id)?.id}`}
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
                          {line.category}: {line.label} /{" "}
                          {formatMoney(line.amount, line.currencyCode)}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ) : null}
        {activeTab === "payslips" ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Payslips
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Generated employee payslips and stored PDF documents.
                </p>
              </div>
              <Summary label="Records" value={`${payslips.length}`} />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-surface-strong text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Payslip</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Net pay
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Document
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payslips.length ? (
                    payslips.map((payslip) => (
                      <tr key={payslip.id}>
                        <td className="px-4 py-3">
                          {payslip.employee
                            ? `${payslip.employee.firstName} ${payslip.employee.lastName}`
                            : payslip.employeeId}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {payslip.payslipNumber}
                        </td>
                        <td className="px-4 py-3">{payslip.status}</td>
                        <td className="px-4 py-3 text-right">
                          {formatMoney(payslip.netPay, payslip.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-3">
                            <a
                              className="font-medium text-accent"
                              href={`/payroll/payslips/${payslip.id}`}
                            >
                              View
                            </a>
                            <a
                              className="font-medium text-accent"
                              href={`/api/payslips/${payslip.id}/download`}
                            >
                              Download PDF
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted"
                        colSpan={5}
                      >
                        No payslips generated for this run.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
        {activeTab === "cost-allocation" ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Cost Allocation
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Project, customer, and bench allocation generated from payroll
                  results.
                </p>
              </div>
              <Summary
                label="Records"
                value={`${costAllocations.meta.total}`}
              />
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-surface-strong text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Project</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Allocation
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {costAllocations.items.length ? (
                    costAllocations.items.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3">{line.employeeName}</td>
                        <td className="px-4 py-3 text-muted">
                          {line.isBench
                            ? "Bench"
                            : (line.projectName ?? "Unassigned")}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {line.customerName ?? ""}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number(line.allocationPercentage).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatMoney(line.originalAmount, line.currencyCode)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted"
                        colSpan={5}
                      >
                        No cost allocation lines generated for this run.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
        {activeTab === "exceptions" ? (
          <article className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-foreground">
              Exceptions
            </h3>
            <div className="mt-4 grid gap-3">
              {exceptions.length ? (
                exceptions.map((exception) => (
                  <div
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
                    key={exception.id}
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {exception.severity} / {exception.errorType}
                      </p>
                      <p className="text-muted">
                        {exception.employee?.employeeCode ?? "Run"}:{" "}
                        {exception.message}
                      </p>
                    </div>
                    {canResolveExceptions ? (
                      <PayrollExceptionActions
                        exceptionId={exception.id}
                        isResolved={exception.isResolved}
                        runId={runId}
                      />
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No exceptions recorded.</p>
              )}
            </div>
          </article>
        ) : null}
      </section>
    </PayrollLayoutShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-lg border border-border bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function WorkflowStepCard({
  index,
  isCurrent,
  label,
  status,
}: {
  index: number;
  isCurrent: boolean;
  label: string;
  status: string;
}) {
  const isCompleted = status === "COMPLETED";
  return (
    <li
      className={`rounded-lg border p-3 ${
        isCurrent ? "border-accent/40 bg-accent/5" : "border-border bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-muted">
          Step {index + 1}
        </p>
        {isCurrent ? (
          <span className="rounded-full border border-accent/30 px-2 py-0.5 text-[11px] font-semibold uppercase text-accent">
            Next
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-semibold text-foreground">{label}</p>
      <p
        className={
          isCompleted ? "mt-2 text-xs text-success" : "mt-2 text-xs text-muted"
        }
      >
        {status}
      </p>
    </li>
  );
}
