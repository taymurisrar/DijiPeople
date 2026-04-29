import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import { PayrollRunRecord, PayslipRecord } from "../../payroll-run-types";
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
            />
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
