import { AttendanceEntryRecord } from "../types";
import { AttendanceStatusBadge } from "./attendance-status-badge";

export function AttendanceEntriesTable({
  entries,
  showEmployee = false,
}: {
  entries: AttendanceEntryRecord[];
  showEmployee?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 text-center shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          No attendance entries
        </p>
        <h4 className="mt-3 text-2xl font-semibold text-foreground">
          No matching attendance records were found.
        </h4>
        <p className="mt-3 text-muted">
          Try widening the date range, adjusting the filters, or importing
          attendance rows from your source file.
        </p>
      </section>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              {showEmployee ? (
                <th className="px-5 py-4 font-medium">Employee</th>
              ) : null}
              <th className="px-5 py-4 font-medium">Date</th>
              <th className="px-5 py-4 font-medium">Mode</th>
              <th className="px-5 py-4 font-medium">Check in</th>
              <th className="px-5 py-4 font-medium">Check out</th>
              <th className="px-5 py-4 font-medium">Duration</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Location</th>
              <th className="px-5 py-4 font-medium">Source</th>
              <th className="px-5 py-4 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white/90">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-accent-soft/30">
                {showEmployee ? (
                  <td className="px-5 py-4 align-top">
                    <p className="font-semibold text-foreground">
                      {entry.employee.fullName}
                    </p>
                    <p className="mt-1 text-muted">
                      {entry.employee.employeeCode}
                    </p>
                  </td>
                ) : null}
                <td className="px-5 py-4 align-top text-muted">
                  {new Date(entry.attendanceDate).toLocaleDateString()}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {formatAttendanceMode(entry.attendanceMode)}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {entry.checkInAt ? formatTime(entry.checkInAt) : "Not recorded"}
                  {entry.isLateCheckIn && entry.lateCheckInMinutes ? (
                    <p className="mt-1 text-xs text-danger">
                      Late by {entry.lateCheckInMinutes} min
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {entry.checkOutAt ? formatTime(entry.checkOutAt) : "Pending"}
                  {entry.isLateCheckOut && entry.lateCheckOutMinutes ? (
                    <p className="mt-1 text-xs text-warning">
                      Beyond grace by {entry.lateCheckOutMinutes} min
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {entry.durationLabel ?? "Open"}
                </td>
                <td className="px-5 py-4 align-top">
                  <AttendanceStatusBadge status={entry.status} />
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {entry.officeLocation?.name ??
                    entry.remoteAddressText ??
                    "No location"}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {entry.source}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {entry.workSummary ??
                    entry.checkOutNote ??
                    entry.checkInNote ??
                    entry.notes ??
                    "No details"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAttendanceMode(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
