import Link from "next/link";

import { StatusPill } from "@/app/components/ui/status-pill";
import {
  dayStatusLabel,
  dayStatusTone,
  formatClockTime,
  formatDayDate,
  formatMinutesOrDash,
  formatWorkedMinutes,
  workModeLabel,
} from "../_lib/format";
import type { TeamDayRow } from "../_lib/views";

/**
 * The reconciled days for a team.
 *
 * A day the engine has not finished with says `Processing` and shows no worked
 * total. That is the important behaviour in this file: the numbers on an
 * unreconciled row may be from a previous run, and a manager approving a
 * timesheet from them would be approving a superseded figure.
 *
 * Counts come from the server for the whole filtered set. Nothing is tallied
 * here, because a total that only described the current page would be wrong in
 * the one way nobody would notice.
 */
export function TeamDaysTable({
  items,
  page,
  pageSize,
  total,
}: {
  items: TeamDayRow[];
  page: number;
  pageSize: number;
  total: number;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing matches this view for the selected dates.
      </p>
    );
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[72rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <Th>Employee</Th>
              <Th>Date</Th>
              <Th>Shift</Th>
              <Th>Status</Th>
              <Th>In</Th>
              <Th>Out</Th>
              <Th>Worked</Th>
              <Th>Mode</Th>
              <Th>Late</Th>
              <Th>Early out</Th>
              <Th>Beyond shift</Th>
              <Th>Approved OT</Th>
              <Th>Needs attention</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr className="border-b border-border/60" key={row.id}>
                <Td>
                  <span className="font-medium text-foreground">
                    {row.employee.name}
                  </span>
                  {row.employee.employeeCode ? (
                    <span className="block text-xs text-muted">
                      {row.employee.employeeCode}
                    </span>
                  ) : null}
                </Td>
                <Td>
                  {/* Links to the existing attendance record rather than to a
                      second detail page. Absent until the day has been
                      reconciled, because there is nothing to open yet. */}
                  {row.attendanceEntryId ? (
                    <Link
                      className="font-medium text-accent hover:underline"
                      href={`/attendance/${row.attendanceEntryId}`}
                    >
                      {formatDayDate(row.attendanceDate)}
                    </Link>
                  ) : (
                    formatDayDate(row.attendanceDate)
                  )}
                </Td>
                <Td>{row.shift?.name ?? "—"}</Td>
                <Td>
                  {row.reconciliationPending ? (
                    <StatusPill tone="muted">Processing</StatusPill>
                  ) : (
                    <StatusPill tone={dayStatusTone(row.status)}>
                      {dayStatusLabel(row.status)}
                    </StatusPill>
                  )}
                </Td>
                <Td>{formatClockTime(row.firstCheckInAt)}</Td>
                <Td>{formatClockTime(row.lastCheckOutAt)}</Td>
                <Td>
                  {formatWorkedMinutes(
                    row.workedMinutes,
                    row.reconciliationPending,
                  )}
                </Td>
                <Td>
                  {row.reconciliationPending
                    ? "—"
                    : workModeLabel(row.derivedWorkMode)}
                </Td>
                <Td>{formatMinutesOrDash(row.lateMinutes)}</Td>
                <Td>{formatMinutesOrDash(row.earlyDepartureMinutes)}</Td>
                <Td>{formatMinutesOrDash(row.extraMinutes)}</Td>
                <Td>{formatMinutesOrDash(row.approvedOvertimeMinutes)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    {row.openExceptionCount > 0 ? (
                      <Link
                        href={`/attendance/exceptions?employeeId=${row.employee.id}&from=${row.attendanceDate}&to=${row.attendanceDate}&status=OPEN`}
                      >
                        <StatusPill tone="warning">
                          {row.openExceptionCount === 1
                            ? "1 exception"
                            : `${row.openExceptionCount} exceptions`}
                        </StatusPill>
                      </Link>
                    ) : null}
                    {row.pendingCorrectionCount > 0 ? (
                      <StatusPill tone="warning">
                        {row.pendingCorrectionCount === 1
                          ? "1 correction pending"
                          : `${row.pendingCorrectionCount} corrections pending`}
                      </StatusPill>
                    ) : null}
                    {row.locked ? (
                      <StatusPill tone="muted">Finalised</StatusPill>
                    ) : null}
                    {row.onLeave ? (
                      <StatusPill tone="info">On leave</StatusPill>
                    ) : null}
                    {row.isHoliday ? (
                      <StatusPill tone="neutral">Holiday</StatusPill>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted">
        Showing {first}–{last} of {total}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 align-top">{children}</td>;
}
