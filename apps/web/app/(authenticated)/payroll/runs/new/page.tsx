import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollRunRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";

export default async function NewPayrollRunPage() {
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: await getSessionUser(),
    spec: payrollRunRuntimeSpec,
  });
  return (
    <PayrollLayoutShell
      title="New Payroll Run"
      description="Create a draft run for an open payroll period."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          "",
          "quickCreate",
        )}
        mode="create"
        record={{ payrollPeriodId: "" }}
        runtime={runtime}
        spec={payrollRunRuntimeSpec}
        title="New Payroll Run"
      />
    </PayrollLayoutShell>
  );
}
