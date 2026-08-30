import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime, resolveStandardActiveForm } from "@/lib/runtime/modules/standard-module-route-helpers";
import { employeeBankAccountRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";

export default async function NewEmployeeBankAccountPage() {
  const runtime = buildStandardRouteRuntime({ pageKind: "create", sessionUser: await getSessionUser(), spec: employeeBankAccountRuntimeSpec });
  return <div className="grid gap-6"><StandardModuleRecordPage activeForm={resolveStandardActiveForm(runtime.metadata.forms, "", "quickCreate")} mode="create" record={{ isPrimaryPayroll: false, effectiveFrom: "" }} runtime={runtime} spec={employeeBankAccountRuntimeSpec} title="New Employee Bank Account" /></div>;
}
