import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollCalendarRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

export default async function PayrollCalendarsPage() {
  const user = await getSessionUser();
  const calendars = await apiRequestJson<Array<Record<string, unknown>>>(
    "/payroll/calendars",
  );
  const records = calendars.map((calendar) => ({
    ...calendar,
    businessUnitName: isRecord(calendar.businessUnit)
      ? stringValue(calendar.businessUnit.name)
      : "",
  }));
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: payrollCalendarRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title="Payroll Calendars"
      description="Manage payroll calendar definitions through the shared Module Runtime."
    >
      <StandardModuleListPage
        pagination={{
          page: 1,
          pageSize: Math.max(records.length, 20),
          totalItems: records.length,
          pathname: "/payroll/calendars",
          searchParams: {},
        }}
        paginationMode="client"
        records={records}
        runtime={runtime}
        spec={payrollCalendarRuntimeSpec}
        title="Payroll Calendars"
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
