import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";
import {
  asPayComponents,
  buildEmployeeCompensationSpec,
  type PayComponentRecord,
} from "./compensation-runtime";

export default async function EmployeeCompensationPage() {
  const user = await getSessionUser();
  const [compensations, payComponents] = await Promise.all([
    apiRequestJson<Array<Record<string, unknown>>>("/payroll/compensations"),
    apiRequestJson<PayComponentRecord[]>("/pay-components?isActive=true"),
  ]);
  const spec = buildEmployeeCompensationSpec(asPayComponents(payComponents));
  const records = (Array.isArray(compensations) ? compensations : []).map((compensation) => {
    const employee = isRecord(compensation.employee)
      ? compensation.employee
      : {};
    return {
      ...compensation,
      employeeName:
        stringValue(compensation.employeeName) || stringValue(employee.fullName),
      employeeCode:
        stringValue(compensation.employeeCode) || stringValue(employee.employeeCode),
      workEmail:
        stringValue(compensation.workEmail) || stringValue(employee.workEmail),
    };
  });
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec,
  });

  return (
    <PayrollLayoutShell
      title="Employee Compensation"
      description="Manage employee compensation records through the shared Module Runtime."
    >
      <StandardModuleListPage
        pagination={{
          page: 1,
          pageSize: Math.max(records.length, 20),
          totalItems: records.length,
          pathname: "/payroll/employee-compensation",
          searchParams: {},
        }}
        paginationMode="client"
        records={records}
        runtime={runtime}
        spec={spec}
        title="Employee Compensation"
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
