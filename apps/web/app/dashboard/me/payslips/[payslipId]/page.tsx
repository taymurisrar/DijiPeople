import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { PayslipRecord } from "../../../payroll/payroll-run-types";

type PageProps = { params: Promise<{ payslipId: string }> };

export default async function MyPayslipDetailPage({ params }: PageProps) {
  const { payslipId } = await params;
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.PAYSLIPS_READ_OWN)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to this payslip."
      />
    );
  }

  const payslip = await apiRequestJson<PayslipRecord>(
    `/me/payslips/${payslipId}`,
  );

  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Published Payslip
        </p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">
          {payslip.payslipNumber}
        </h2>
        <p className="mt-3 text-muted">
          {payslip.payrollRun?.payrollPeriod?.name ?? "Payroll period"} /{" "}
          {payslip.currencyCode} {payslip.netPay}
        </p>
      </section>
      <section className="grid gap-4">
        {payslip.lineItems.map((line) => (
          <div
            className="flex flex-wrap justify-between gap-3 rounded-2xl border border-border bg-white p-4"
            key={line.id}
          >
            <div>
              <p className="font-medium text-foreground">{line.label}</p>
              <p className="text-sm text-muted">{line.category}</p>
            </div>
            <p className="font-semibold">
              {line.currencyCode} {line.amount}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
