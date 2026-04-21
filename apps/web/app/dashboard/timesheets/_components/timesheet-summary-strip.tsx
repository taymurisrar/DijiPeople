"use client";

import { TimesheetRecord } from "../types";

export function TimesheetSummaryStrip({
  timesheet,
}: {
  timesheet: TimesheetRecord;
}) {
  const items = [
    { label: "Working Days", value: timesheet.summary.totalWorkDays },
    { label: "Leave Days", value: timesheet.summary.totalLeaveDays },
    { label: "Weekends", value: timesheet.summary.totalWeekendDays },
    { label: "Holidays", value: timesheet.summary.totalHolidayDays },
    { label: "Worked", value: formatHours(timesheet.summary.totalHours) },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {items.map((item) => (
        <article
          key={item.label}
          className="rounded-[24px] border border-border bg-surface px-5 py-5 shadow-sm"
        >
          <p className="text-sm uppercase tracking-[0.16em] text-muted">
            {item.label}
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {item.value}
          </p>
        </article>
      ))}
    </div>
  );
}

function formatHours(hours: number) {
  if (!hours) return "0 hrs";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (wholeHours === 0) return `${minutes} mins`;
  if (minutes === 0) return `${wholeHours} ${wholeHours === 1 ? "hr" : "hrs"}`;
  return `${wholeHours} ${wholeHours === 1 ? "hr" : "hrs"} ${minutes} mins`;
}
