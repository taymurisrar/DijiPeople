import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollCalendarRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";

export default async function NewPayrollCalendarPage() {
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: await getSessionUser(),
    spec: payrollCalendarRuntimeSpec,
  });

  return (
    <PayrollLayoutShell
      title="New Payroll Calendar"
      description="Create a payroll calendar definition."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(runtime.metadata.forms, "", "main")}
        mode="create"
        record={{
          name: "",
          frequency: "MONTHLY",
          timezone: "UTC",
          currencyCode: "",
          isDefault: false,
          isActive: true,
        }}
        runtime={runtime}
        spec={payrollCalendarRuntimeSpec}
        title="New Payroll Calendar"
      />
    </PayrollLayoutShell>
  );
}
