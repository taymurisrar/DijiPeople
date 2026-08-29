import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayslipRecord } from "../../payroll/payroll-run-types";

export default async function MyPayslipsPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYSLIPS_READ_OWN)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to your payslips."
      />
    );
  }

  const payslips = await apiRequestJson<PayslipRecord[]>("/me/payslips");

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Self Service
        </p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">
          My Payslips
        </h2>
        <p className="mt-3 max-w-3xl text-muted">
          Published payroll payslips from the past 12 months, with secure PDF
          downloads.
        </p>
      </section>
      <section className="grid gap-3">
        {payslips.length ? (
          payslips.map((payslip) => (
            <div
              className="rounded-2xl border border-border bg-white p-4 transition hover:border-accent/40"
              key={payslip.id}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    {payslip.payslipNumber}
                  </p>
                  <p className="text-sm text-muted">
                    {payslip.payrollRun?.payrollPeriod?.name ?? "Payroll"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">
                    {payslip.currencyCode} {payslip.netPay}
                  </p>
                  <div className="mt-2 flex gap-3">
                    <Link
                      className="text-sm font-semibold text-accent"
                      href={`/me/payslips/${payslip.id}`}
                    >
                      View
                    </Link>
                    <a
                      className="text-sm font-semibold text-accent"
                      href={`/api/me/payslips/${payslip.id}/download`}
                    >
                      Download PDF
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No published payslips yet.</p>
        )}
      </section>
    </div>
  );
}
