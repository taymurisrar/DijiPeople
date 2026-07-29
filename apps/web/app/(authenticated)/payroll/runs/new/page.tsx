import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { payrollRunRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { PayrollLayoutShell } from "../../_components/payroll-layout-shell";
import { apiRequestJson } from "@/lib/server-api";
import type { TenantResolvedSettingsResponse } from "@/app/(authenticated)/settings/types";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewPayrollRunPage({ searchParams }: Props) {
  const [user, params, settings] = await Promise.all([
    getSessionUser(),
    searchParams,
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved"),
  ]);
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: user,
    spec: payrollRunRuntimeSpec,
  });
  const formId = first(params?.formId);

  return (
    <PayrollLayoutShell
      title="New Payroll Run"
      description="Create a draft run for an open payroll period."
    >
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          formId,
          "main",
        )}
        mode="create"
        record={{
          runName: "",
          payrollPeriodId: "",
          employeeScope: "ALL_ELIGIBLE_EMPLOYEES",
          employerBankAccountId: "",
          defaultGenerationSource: settings.payroll.payrollGenerationSource,
        }}
        runtime={runtime}
        spec={payrollRunRuntimeSpec}
        title="New Payroll Run"
      />
    </PayrollLayoutShell>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
