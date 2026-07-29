import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollCycleRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

type PayrollCycleListResponse = {
  items: Array<Record<string, unknown>>;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
};

export default async function PayrollCyclesPage() {
  const user = await getSessionUser();
  const response = await apiRequestJson<PayrollCycleListResponse>(
    "/payroll/cycles?pageSize=25",
  );
  const records = response.items.map((cycle) => {
    const region = isRecord(cycle.payrollRegion) ? cycle.payrollRegion : {};
    const employerAccount = isRecord(cycle.defaultEmployerBankAccount)
      ? cycle.defaultEmployerBankAccount
      : {};

    return {
      ...cycle,
      payrollRegionName: stringValue(region.name),
      defaultEmployerBankAccountName: stringValue(employerAccount.accountName),
    };
  });
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: payrollCycleRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title="Payroll Cycles"
      description="Manage reusable payroll cycle definitions, source defaults, date rules, and employer payment accounts."
    >
      <StandardModuleListPage
        pagination={{
          page: response.meta?.page ?? 1,
          pageSize: response.meta?.pageSize ?? 25,
          totalItems: response.meta?.total ?? records.length,
          pathname: "/payroll/cycles",
          searchParams: {},
        }}
        records={records}
        runtime={runtime}
        spec={payrollCycleRuntimeSpec}
        title="Payroll Cycles"
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
