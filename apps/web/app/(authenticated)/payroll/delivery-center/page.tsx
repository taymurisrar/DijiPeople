import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { payslipRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

export default async function PayrollDeliveryCenterPage() {
  const user = await getSessionUser();
  const payslips = await apiRequestJson<Array<Record<string, unknown>>>(
    "/payslips",
  );
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: payslipRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title="Delivery Center"
      description="Review payslip generation and delivery status from the shared payroll runtime."
    >
      <StandardModuleListPage
        pagination={{
          page: 1,
          pageSize: Math.max(payslips.length, 20),
          totalItems: payslips.length,
          pathname: "/payroll/delivery-center",
          searchParams: {},
        }}
        paginationMode="client"
        records={payslips}
        runtime={runtime}
        spec={payslipRuntimeSpec}
        title="Delivery Center"
      />
    </PayrollLayoutShell>
  );
}
