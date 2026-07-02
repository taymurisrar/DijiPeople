import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { payslipRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

export default async function PayrollPayslipsPage() {
  const [rows, user] = await Promise.all([
    apiRequestJson<Record<string, unknown>[]>("/payslips"),
    getSessionUser(),
  ]);
  const records = rows.map((row) => {
    const employee = isRecord(row.employee) ? row.employee : {};
    const run = isRecord(row.payrollRun) ? row.payrollRun : {};
    const period = isRecord(run.payrollPeriod) ? run.payrollPeriod : {};
    return {
      ...row,
      employeeName: [employee.firstName, employee.lastName]
        .filter((value) => typeof value === "string")
        .join(" "),
      periodName: period.name,
    };
  });
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: payslipRuntimeSpec,
  });
  return (
    <PayrollLayoutShell
      title="Payslips"
      description="Review frozen payslip history through the shared Module Runtime."
    >
      <StandardModuleListPage
        records={records}
        runtime={runtime}
        spec={payslipRuntimeSpec}
        title="Payslips"
      />
    </PayrollLayoutShell>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
