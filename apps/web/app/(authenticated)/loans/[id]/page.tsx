import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime, resolveStandardActiveForm } from "@/lib/runtime/modules/standard-module-route-helpers";
import { loanRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, user] = await Promise.all([apiRequestJson<Record<string, unknown>>(`/loans/${id}`), getSessionUser()]);
  const runtime = buildStandardRouteRuntime({ pageKind: "detail", recordId: id, sessionUser: user, spec: loanRuntimeSpec });
  return <main className="grid gap-6"><StandardModuleRecordPage activeForm={resolveStandardActiveForm(runtime.metadata.forms, "")} mode="read" record={record} recordId={id} runtime={runtime} spec={loanRuntimeSpec} title={typeof record.requestNumber === "string" ? record.requestNumber : "Loan Request"} /></main>;
}
