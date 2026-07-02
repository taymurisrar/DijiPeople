import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime, resolveStandardActiveForm } from "@/lib/runtime/modules/standard-module-route-helpers";
import { benefitAssignmentRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function BenefitAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, user] = await Promise.all([apiRequestJson<Record<string, unknown>>(`/benefits/assignments/${id}`), getSessionUser()]);
  const runtime = buildStandardRouteRuntime({ pageKind: "detail", recordId: id, sessionUser: user, spec: benefitAssignmentRuntimeSpec });
  return <main className="grid gap-6"><StandardModuleRecordPage activeForm={resolveStandardActiveForm(runtime.metadata.forms, "")} mode="read" record={record} recordId={id} runtime={runtime} spec={benefitAssignmentRuntimeSpec} title="Benefit Assignment" /></main>;
}
