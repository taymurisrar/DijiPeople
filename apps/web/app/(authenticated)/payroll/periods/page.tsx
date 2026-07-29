import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollPeriodRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

export default async function PayrollPeriodsPage() {
  const user = await getSessionUser();
  const periods = await apiRequestJson<Array<Record<string, unknown>>>(
    "/payroll/periods",
  );
  const records = periods.map((period) => ({
    ...period,
    calendarName: isRecord(period.payrollCalendar)
      ? stringValue(period.payrollCalendar.name)
      : "",
  }));
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: payrollPeriodRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title="Payroll Periods"
      description="Manage payroll periods through the shared Module Runtime."
    >
      <StandardModuleListPage
        pagination={{
          page: 1,
          pageSize: Math.max(records.length, 20),
          totalItems: records.length,
          pathname: "/payroll/periods",
          searchParams: {},
        }}
        paginationMode="client"
        records={records}
        runtime={runtime}
        spec={payrollPeriodRuntimeSpec}
        title="Payroll Periods"
      />
    </PayrollLayoutShell>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
