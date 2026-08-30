import { StandardModuleRecordPage } from "@/app/components/runtime";
import { AccessDeniedState } from "@/app/(authenticated)/_components/access-denied-state";
import { AttendanceCorrectionPanel } from "@/app/components/attendance-corrections/attendance-correction-panel";
import { getSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { attendanceRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { ApiRequestError } from "@/lib/server-api";
import { AttendanceDayPanel } from "../_components/attendance-day-panel";
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
        <div className="dp-theme-scope dp-attendance-scope grid gap-6">
          <AccessDeniedState
            description={error.message}
            errorCode={error.errorCode ?? "ACCESS_DENIED"}
            requestPath={`/attendance/${entryId}`}
            statusCode={error.status}
            title="You cannot view this attendance record."
            traceId={error.traceId}
          />
        </div>
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
    <div className="dp-theme-scope dp-attendance-scope grid gap-6">
      {/*
        Above the record, because the owner's description of this is a button on
        the record page whose submit control is "on the top" — and because when
        the panel opens it takes the place the record's own header occupied.

        It writes a correction request, never the attendance row. See
        `AttendanceCorrectionPanel` for why that distinction is the design rather
        than a shortcut.
      */}
      <AttendanceCorrectionPanel
        canRequest={canRequestCorrection(sessionUser, record)}
        entry={{
          id: record.id,
          date: record.date,
          attendanceDate: record.attendanceDate,
          checkInAt: record.checkInAt,
          checkIn: record.checkIn,
          checkOutAt: record.checkOutAt,
          checkOut: record.checkOut,
          attendanceMode: record.attendanceMode,
          officeLocationId: record.officeLocationId,
          status: record.status,
        }}
      />
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
      {/*
        Appended below the existing record rather than replacing any of it. The
        page above shows the day's single check-in and check-out, which is the
        whole truth for most days; this shows the individual work periods behind
        it, which is the only way a hybrid day makes sense.
      */}
      <AttendanceDayPanel
        date={attendanceDateKey(record)}
        employeeId={record.employeeId}
      />
    </div>
  );
}

/**
 * Whether this viewer may raise a correction against this record.
 *
 * Mirrors `AttendanceService.canCreateAttendanceCorrection` plus the ownership
 * rule the same method enforces one step later: a correction can only ever be
 * filed against your own attendance, whoever else can read it. Duplicated here
 * only so the control is not offered to someone the API would refuse — the
 * server re-decides both halves, and its answer is the one that counts.
 */
function canRequestCorrection(
  sessionUser: { permissionKeys: string[] } | null,
  record: AttendanceEntryRecord,
): boolean {
  if (!sessionUser || !record.isCurrentUsersEntry) return false;
  return hasAnyPermission(sessionUser.permissionKeys, [
    PERMISSION_KEYS.ATTENDANCE_CORRECTION_CREATE,
    PERMISSION_KEYS.ATTENDANCE_READ,
    PERMISSION_KEYS.ATTENDANCE_READ_OWN,
    PERMISSION_KEYS.ATTENDANCE_READ_TEAM,
    PERMISSION_KEYS.ATTENDANCE_READ_ALL,
  ]);
}

/**
 * The attendance date this record belongs to, as YYYY-MM-DD.
 *
 * Taken from the record's own date rather than from the check-in time: on an
 * overnight shift those are different days, and the reconciled day is keyed on
 * the former.
 */
function attendanceDateKey(record: AttendanceEntryRecord): string {
  const value = record.date ?? record.checkInAt ?? record.checkIn;
  if (!value) return "";
  return String(value).slice(0, 10);
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
