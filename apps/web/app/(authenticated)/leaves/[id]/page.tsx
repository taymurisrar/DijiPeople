import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { leaveRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import type { LeaveRequestRecord } from "../types";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function LeaveDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ id }, resolvedSearchParams, sessionUser] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  const request = await apiRequestJson<LeaveRequestRecord>(
    `/leave-requests/${id}`,
  );
  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "detail",
    recordId: request.id,
    sessionUser,
    spec: leaveRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <main className="dp-theme-scope dp-leaves-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="read"
        record={mapLeaveRecord(request)}
        recordId={request.id}
        runtime={runtime}
        spec={leaveRuntimeSpec}
      />
    </main>
  );
}

function mapLeaveRecord(request: LeaveRequestRecord) {
  return {
    ...request,
    requestName: `${request.leaveType.name} ${request.startDate} - ${request.endDate}`,
    employeeName: request.employee.fullName,
    leaveTypeName: request.leaveType.name,
    durationDays: Number(request.totalDays),
  };
}
