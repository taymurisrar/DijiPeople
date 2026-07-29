import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { bankRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";

export default async function NewPayrollBankPage() {
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: await getSessionUser(),
    spec: bankRuntimeSpec,
  });

  return (
    <StandardModuleRecordPage
      activeForm={resolveStandardActiveForm(runtime.metadata.forms, "", "main")}
      mode="create"
      record={{
        name: "",
        code: "",
        countryCode: "",
        isActive: true,
      }}
      runtime={runtime}
      spec={bankRuntimeSpec}
      title="New Bank"
    />
  );
}
