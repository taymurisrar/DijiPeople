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
        lookupDisplayValues={{ ownerId: record.employee.fullName }}
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
    ownerId: record.employeeId,
    ownerDisplayName: record.employee.fullName,
    subStatus: resolveAttendanceSubStatus(record),
    checkIn: record.checkInAt ?? record.checkIn,
    checkOut: record.checkOutAt ?? record.checkOut,
    duration: record.durationLabel ?? "",
    location: record.officeLocation?.name ?? record.remoteAddressText ?? "",
    checkInLocation: buildMapLocationValue(
      record.checkInAddressText ?? record.checkInLocation,
      record.checkInLatitude,
      record.checkInLongitude,
    ),
    checkOutLocation: record.checkOutAt
      ? buildMapLocationValue(
          record.checkOutAddressText ?? record.checkOutLocation,
          record.checkOutLatitude,
          record.checkOutLongitude,
        )
      : "Not recorded",
  };
}

function buildMapLocationValue(
  address: string | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    return address ?? "Not captured";
  }

  const coordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  return {
    label: address?.trim() ? `${address.trim()} · ${coordinates}` : coordinates,
    href: `https://www.google.com/maps?q=${encodeURIComponent(
      `${latitude},${longitude}`,
    )}`,
  };
}

function resolveAttendanceSubStatus(record: AttendanceEntryRecord) {
  if (record.status === "MISSED_CHECK_OUT") return "MISSING_CHECK_OUT";
  if (record.isLateCheckOut) return "LATE_CHECK_OUT";
  if (record.isLateCheckIn) return "LATE_CHECK_IN";
  if (record.status === "CHECKED_IN") return "IN_PROGRESS";
  if (["CHECKED_OUT", "PRESENT"].includes(record.status)) return "COMPLETED";
  if (record.status === "ON_LEAVE") return "APPROVED_LEAVE";
  if (record.status === "ABSENT") return "NO_ATTENDANCE";
  if (record.status === "HALF_DAY") return "PARTIAL_DAY";
  return "STANDARD";
}
