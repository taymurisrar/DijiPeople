import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { apiRequestJson } from "@/lib/server-api";
import type { TenantResolvedSettingsResponse } from "@/app/(authenticated)/settings/types";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import {
  asPayComponents,
  buildEmployeeCompensationSpec,
  type PayComponentRecord,
} from "../compensation-runtime";

export default async function NewEmployeeCompensationPage() {
  const [user, settings, payComponents] = await Promise.all([
    getSessionUser(),
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved"),
    apiRequestJson<PayComponentRecord[]>("/pay-components?isActive=true"),
  ]);
  const spec = buildEmployeeCompensationSpec(asPayComponents(payComponents));
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: user,
    spec,
  });

  return (
    <PayrollLayoutShell
      title="New Employee Compensation"
      description="Create an employee compensation record."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(runtime.metadata.forms, "", "main")}
        mode="create"
        record={{
          employeeId: "",
          basicSalary: null,
          currency: settings.payroll.defaultCurrency,
          payFrequency: settings.payroll.payFrequency,
          effectiveDate: "",
        }}
        runtime={runtime}
        spec={spec}
        title="New Employee Compensation"
      />
    </PayrollLayoutShell>
  );
}
