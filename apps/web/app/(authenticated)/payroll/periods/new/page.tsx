import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollPeriodRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";

export default async function NewPayrollPeriodPage() {
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: await getSessionUser(),
    spec: payrollPeriodRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title="New Payroll Period"
      description="Create a payroll period under a payroll calendar."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(runtime.metadata.forms, "", "main")}
        mode="create"
        record={{
          name: "",
          payrollCalendarId: "",
          periodStart: "",
          periodEnd: "",
          status: "OPEN",
        }}
        runtime={runtime}
        spec={payrollPeriodRuntimeSpec}
        title="New Payroll Period"
      />
    </PayrollLayoutShell>
  );
}
