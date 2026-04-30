import { apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import { PayslipRecord } from "../../payroll-run-types";
import { PayslipActions } from "./_components/payslip-actions";

type PageProps = { params: Promise<{ payslipId: string }> };

export default async function PayrollPayslipDetailPage({ params }: PageProps) {
  const { payslipId } = await params;
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

  const payslip = await apiRequestJson<PayslipRecord>(`/payslips/${payslipId}`);

  return (
    <PayrollLayoutShell
      title={payslip.payslipNumber}
      description={`${payslip.employee?.firstName ?? "Employee"} ${payslip.employee?.lastName ?? ""} / ${payslip.status}`}
    >
      <section className="grid gap-6">
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="grid gap-3 md:grid-cols-4">
              <Summary label="Gross" value={`${payslip.currencyCode} ${payslip.grossEarnings}`} />
              <Summary label="Deductions" value={`${payslip.currencyCode} ${payslip.totalDeductions}`} />
              <Summary label="Reimbursements" value={`${payslip.currencyCode} ${payslip.totalReimbursements}`} />
              <Summary label="Net Pay" value={`${payslip.currencyCode} ${payslip.netPay}`} />
            </div>
            <PayslipActions
              canPublish={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYSLIPS_PUBLISH,
              )}
              canVoid={hasPermission(
                user.permissionKeys,
                PERMISSION_KEYS.PAYSLIPS_VOID,
              )}
              payslipId={payslip.id}
              status={payslip.status}
            />
          </div>
        </article>
        <LineSection
          lines={payslip.lineItems.filter((line) =>
            ["EARNING", "ALLOWANCE"].includes(line.category),
          )}
          title="Earnings"
        />
        <LineSection
          lines={payslip.lineItems.filter(
            (line) => line.category === "REIMBURSEMENT",
          )}
          title="Reimbursements"
        />
        <LineSection
          lines={payslip.lineItems.filter((line) =>
            line.category === "DEDUCTION",
          )}
          title="Deductions"
        />
        <LineSection
          lines={payslip.lineItems.filter((line) => line.category === "TAX")}
          title="Taxes"
        />
        <LineSection
          lines={payslip.lineItems.filter(
            (line) => line.category === "EMPLOYER_CONTRIBUTION",
          )}
          title="Employer Contributions"
        />
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

function LineSection({
  lines,
  title,
}: {
  lines: PayslipRecord["lineItems"];
  title: string;
}) {
  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      <div className="mt-4 grid gap-2">
        {lines.length ? (
          lines.map((line) => (
            <div
              className="flex flex-wrap justify-between gap-3 rounded-2xl border border-border bg-white p-4 text-sm"
              key={line.id}
            >
              <span className="font-medium text-foreground">{line.label}</span>
              <span>
                {line.currencyCode} {line.amount}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No line items.</p>
        )}
      </div>
    </article>
  );
}
