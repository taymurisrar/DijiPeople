import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { employerBankAccountRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";

export default async function NewEmployerBankAccountPage() {
  const runtime = buildStandardRouteRuntime({
    pageKind: "create",
    sessionUser: await getSessionUser(),
    spec: employerBankAccountRuntimeSpec,
  });
  return (
    <main className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={resolveStandardActiveForm(
          runtime.metadata.forms,
          "",
          "main",
        )}
        mode="create"
        record={{
          accountPurpose: "PAYROLL",
          isDefaultPayrollAccount: false,
          isActive: true,
        }}
        runtime={runtime}
        spec={employerBankAccountRuntimeSpec}
        title="New Employer Bank Account"
      />
    </main>
  );
}
