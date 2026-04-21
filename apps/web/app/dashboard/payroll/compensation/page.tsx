import { apiRequestJson } from "@/lib/server-api";
import { EmployeeListResponse } from "@/app/dashboard/employees/types";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import { EmployeeCompensationForm } from "../_components/employee-compensation-form";
import { EmployeeCompensationRecord } from "../types";

export default async function EmployeeCompensationPage() {
  const [compensations, employees] = await Promise.all([
    apiRequestJson<EmployeeCompensationRecord[]>("/payroll/compensations"),
    apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
  ]);

  return (
    <PayrollLayoutShell
      description="Employee compensation anchors payroll structure today and gives us the right extension point for allowances, overtime, taxes, and future effective-dated pay changes."
      title="Employee Compensation"
    >
      <EmployeeCompensationForm
        compensations={compensations}
        employees={employees.items.filter((employee) => employee.employmentStatus !== "TERMINATED")}
      />

      {compensations.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            No compensation records yet
          </p>
          <h4 className="mt-3 text-2xl font-semibold text-foreground">
            Assign pay structure to employees before running payroll drafts.
          </h4>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-strong text-left text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Employee</th>
                  <th className="px-5 py-4 font-medium">Basic salary</th>
                  <th className="px-5 py-4 font-medium">Frequency</th>
                  <th className="px-5 py-4 font-medium">Effective</th>
                  <th className="px-5 py-4 font-medium">Ends</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/90">
                {compensations.map((compensation) => (
                  <tr key={compensation.id} className="hover:bg-accent-soft/30">
                    <td className="px-5 py-4">
                      <p className="font-medium text-foreground">{compensation.employee.fullName}</p>
                      <p className="mt-1 text-muted">{compensation.employee.employeeCode}</p>
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {compensation.currency} {compensation.basicSalary}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {compensation.payFrequency.replaceAll("_", " ")}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {new Date(compensation.effectiveDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-muted">
                      {compensation.endDate ? new Date(compensation.endDate).toLocaleDateString() : "Open-ended"}
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

