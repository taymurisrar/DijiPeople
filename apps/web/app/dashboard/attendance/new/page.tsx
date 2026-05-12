import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import type {
  AttendanceEntryRecord,
  AttendanceListResponse,
  AttendanceLocationOption,
} from "../types";
import { AttendanceNewClient } from "../_components/attendance-new-client";

export default async function NewAttendancePage() {
  const result = await loadAttendanceNewPageData();

  if (result.status === "employee-link-required") {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description={result.message}
          title="Attendance self-service needs an employee record."
        />
      </main>
    );
  }

  return (
    <main className="dp-theme-scope dp-attendance-scope grid gap-6">
      <AttendanceNewClient
        activeEntry={result.activeEntry}
        locations={result.locations}
        todayEntry={result.todayEntry}
      />
    </main>
  );
}

async function loadAttendanceNewPageData() {
  const today = formatLocalDate(new Date());

  try {
    const [activeEntry, todayEntries, locations] = await Promise.all([
      apiRequestJson<AttendanceEntryRecord | null>("/attendance/mine/active"),
      apiRequestJson<AttendanceListResponse>(
        `/attendance/mine?dateFrom=${today}&dateTo=${today}&pageSize=1`,
      ),
      apiRequestJson<AttendanceLocationOption[]>("/attendance/locations"),
    ]);

    return {
      status: "ready" as const,
      activeEntry,
      locations,
      todayEntry: todayEntries.items[0] ?? null,
    };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 400) {
      return {
        status: "employee-link-required" as const,
        message: error.message,
      };
    }

    throw error;
  }
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}
