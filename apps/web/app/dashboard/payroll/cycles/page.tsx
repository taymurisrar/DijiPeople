import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../../_lib/business-unit-access";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import { PayrollCycleForm } from "../_components/payroll-cycle-form";
import { PayrollCycleStatusBadge } from "../_components/payroll-cycle-status-badge";
import { PayrollCycleListResponse } from "../types";

export default async function PayrollCyclesPage() {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <PayrollLayoutShell
        description="Payroll cycles require business-unit scoped access."
        title="Payroll Cycles"
      >
        <AccessDeniedState
          description="Your current business-unit scope does not include payroll cycle records."
          title="Payroll cycles are unavailable for your current business unit access."
        />
      </PayrollLayoutShell>
    );
  }

  const cycles = await apiRequestJson<PayrollCycleListResponse>(
    "/payroll/cycles?pageSize=24",
  );

  return (
    <PayrollLayoutShell
      description="Payroll cycles define the processing window and give us a clean place to generate draft payroll records before taxes, allowances, and exports are layered in later."
      title="Payroll Cycles"
    >
      <PayrollCycleForm />

      {cycles.items.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            No payroll cycles yet
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Create your first payroll period.
          </h4>
          <p className="mt-3 text-muted">
            The first version focuses on payroll period structure and draft records, not a full payroll engine.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Period</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Run date</th>
                  <th className="px-5 py-4 font-medium">Records</th>
                  <th className="px-5 py-4 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {cycles.items.map((cycle) => (
                  <tr key={cycle.id} className="hover:bg-accent-soft/30">
                    <td className="px-5 py-4 font-medium text-foreground">
                      <p>{new Date(cycle.periodStart).toLocaleDateString()} - {new Date(cycle.periodEnd).toLocaleDateString()}</p>
                    </td>
                    <td className="px-5 py-4">
                      <PayrollCycleStatusBadge status={cycle.status} />
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {cycle.runDate ? new Date(cycle.runDate).toLocaleDateString() : "Not scheduled"}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {cycle.counts.records}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        className="text-sm font-medium text-accent transition hover:text-accent-strong"
                        href={`/dashboard/payroll/cycles/${cycle.id}`}
                      >
                        View draft
                      </Link>
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
