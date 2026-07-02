import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime, resolveStandardActiveForm } from "@/lib/runtime/modules/standard-module-route-helpers";
import { loanRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";

export default async function NewLoanPage() {
  const runtime = buildStandardRouteRuntime({ pageKind: "create", sessionUser: await getSessionUser(), spec: loanRuntimeSpec });
  return <main className="grid gap-6"><StandardModuleRecordPage activeForm={resolveStandardActiveForm(runtime.metadata.forms, "", "quickCreate")} mode="create" record={{ requestedAmount: 0, installmentCount: 1, requestedStartDate: "" }} runtime={runtime} spec={loanRuntimeSpec} title="New Loan Request" /></main>;
}
