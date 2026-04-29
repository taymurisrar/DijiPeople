import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import { PayslipRecord } from "../payroll-run-types";

export default async function PayrollPayslipsPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYSLIPS_READ_ALL)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to payslips."
      />
    );
  }

  const payslips = await apiRequestJson<PayslipRecord[]>("/payslips");

  return (
    <PayrollLayoutShell
      title="Payslips"
      description="Review generated employee payslips before publishing them for self-service."
    >
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="grid gap-3">
          {payslips.length ? (
            payslips.map((payslip) => (
              <Link
                className="rounded-2xl border border-border bg-white p-4 transition hover:border-accent/40"
                href={`/dashboard/payroll/payslips/${payslip.id}`}
                key={payslip.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {payslip.payslipNumber}
                    </p>
                    <p className="text-sm text-muted">
                      {payslip.employee?.firstName} {payslip.employee?.lastName}{" "}
                      / {payslip.employee?.employeeCode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted">{payslip.status}</p>
                    <p className="font-semibold text-foreground">
                      {payslip.currencyCode} {payslip.netPay}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted">No payslips generated yet.</p>
          )}
        </div>
      </article>
    </PayrollLayoutShell>
  );
}
