import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime, resolveStandardActiveForm } from "@/lib/runtime/modules/standard-module-route-helpers";
import { benefitAssignmentRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";

export default async function NewBenefitAssignmentPage() {
  const runtime = buildStandardRouteRuntime({ pageKind: "create", sessionUser: await getSessionUser(), spec: benefitAssignmentRuntimeSpec });
  return <main className="grid gap-6"><StandardModuleRecordPage activeForm={resolveStandardActiveForm(runtime.metadata.forms, "", "quickCreate")} mode="create" record={{ effectiveFrom: "", isManualOverride: true }} runtime={runtime} spec={benefitAssignmentRuntimeSpec} title="New Benefit Assignment" /></main>;
}
