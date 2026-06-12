import { StandardModuleRecordPage } from "@/app/components/runtime";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { attendanceRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { ApiRequestError } from "@/lib/server-api";
import type { AttendanceEntryRecord } from "../types";

type PageProps = {
  params: Promise<{ entryId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function AttendanceRecordPage({
  params,
  searchParams,
}: PageProps) {
  const [{ entryId }, resolvedSearchParams, sessionUser] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { formId?: string }),
    getSessionUser(),
  ]);
  let record: AttendanceEntryRecord;
  try {
    record = await apiRequestJson<AttendanceEntryRecord>(
      `/attendance/${encodeURIComponent(entryId)}`,
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return (
        <main className="dp-theme-scope dp-attendance-scope grid gap-6">
          <AccessDeniedState
            description={error.message}
            errorCode={error.errorCode ?? "ACCESS_DENIED"}
            requestPath={`/attendance/${entryId}`}
            statusCode={error.status}
            title="You cannot view this attendance record."
            traceId={error.traceId}
          />
        </main>
      );
    }
    throw error;
  }
  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "detail",
    recordId: entryId,
    sessionUser,
    spec: attendanceRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );
  const runtimeRecord = toAttendanceRuntimeRecord(record);

  return (
    <main className="dp-theme-scope dp-attendance-scope grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="read"
        record={runtimeRecord}
        recordId={entryId}
        runtime={runtime}
        spec={attendanceRuntimeSpec}
        title={String(runtimeRecord.entryName ?? "Attendance Entry")}
      />
    </main>
  );
}

function toAttendanceRuntimeRecord(record: AttendanceEntryRecord) {
  return {
    ...record,
    entryName: `${record.employee.fullName} Attendance`,
    employeeName: record.employee.fullName,
    checkIn: record.checkInAt ?? record.checkIn,
    checkOut: record.checkOutAt ?? record.checkOut,
    duration: record.durationLabel ?? "",
    location: record.officeLocation?.name ?? record.remoteAddressText ?? "",
  };
}
