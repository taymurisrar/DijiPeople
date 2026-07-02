import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollRunRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import { AccessDeniedState } from "../../_components/access-denied-state";

export default async function PayrollRunsPage() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, "payroll-runs.read")) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="Payroll run access is required."
      />
    );
  }
  const rows = await apiRequestJson<Record<string, unknown>[]>("/payroll/runs");
  const records = rows.map((row) => {
    const period = isRecord(row.payrollPeriod) ? row.payrollPeriod : {};
    return {
      ...row,
      runName: `${typeof period.name === "string" ? period.name : "Payroll Run"} / Run ${String(row.runNumber ?? 1)}`,
      periodName: period.name,
    };
  });
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: payrollRunRuntimeSpec,
  });
  return (
    <PayrollLayoutShell
      title="Payroll Runs"
      description="Create and review payroll runs through the shared Module Runtime."
    >
      <StandardModuleListPage
        records={records}
        runtime={runtime}
        spec={payrollRunRuntimeSpec}
        title="Payroll Runs"
      />
    </PayrollLayoutShell>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
