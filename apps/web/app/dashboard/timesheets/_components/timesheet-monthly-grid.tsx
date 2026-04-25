"use client";

import { TimesheetDayRecord, TimesheetEntryType } from "../types";

type EditableRow = TimesheetDayRecord & {
  uiEntryType: TimesheetEntryType | null;
  uiNote: string;
};

export function TimesheetMONTHLYGrid({
  editable = false,
  invalidDates = [],
  onEntryTypeChange,
  onNoteChange,
  rows,
}: {
  editable?: boolean;
  invalidDates?: string[];
  onEntryTypeChange?: (date: string, nextValue: TimesheetEntryType | null) => void;
  onNoteChange?: (date: string, nextValue: string) => void;
  rows: EditableRow[];
}) {
  const invalidSet = new Set(invalidDates);

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Day</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Indicators</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white/90">
            {rows.map((row) => {
              const dateKey = row.date.slice(0, 10);
              const isInvalid = invalidSet.has(dateKey);

              return (
                <tr
                  key={row.id}
                  className={
                    isInvalid
                      ? "bg-amber-50/80"
                      : row.isHoliday
                        ? "bg-sky-50/70"
                        : row.isWeekend
                          ? "bg-slate-50/70"
                          : ""
                  }
                >
                  <td className="px-4 py-3 text-foreground">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-4 py-3 text-muted">{shortDay(row.dayOfWeek)}</td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <select
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        onChange={(event) =>
                          onEntryTypeChange?.(
                            row.date,
                            (event.target.value || null) as TimesheetEntryType | null,
                          )
                        }
                        value={row.uiEntryType ?? ""}
                      >
                        {row.isWeekend ? (
                          <>
                            <option value="WEEKEND">Weekend</option>
                            <option value="ON_WORK">On Work</option>
                          </>
                        ) : row.isHoliday ? (
                          <>
                            <option value="HOLIDAY">Holiday</option>
                            <option value="ON_WORK">On Work</option>
                          </>
                        ) : (
                          <>
                            <option value="">Select status</option>
                            <option value="ON_WORK">On Work</option>
                            <option value="ON_LEAVE">On Leave</option>
                          </>
                        )}
                      </select>
                    ) : (
                      <span className={badgeClass(row.uiEntryType, row.isWeekend, row.isHoliday)}>
                        {labelForEntry(row.uiEntryType, row.isWeekend, row.isHoliday)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div className="flex flex-wrap gap-2">
                      {row.isWeekend ? <Badge text="Weekend" tone="slate" /> : null}
                      {row.isHoliday ? <Badge text="Holiday" tone="sky" /> : null}
                      {row.leaveRequest ? (
                        <Badge text={row.leaveRequest.leaveType.name} tone="emerald" />
                      ) : null}
                      {isInvalid ? <Badge text="Incomplete" tone="amber" /> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <input
                        className="w-full rounded-xl border border-border bg-white px-3 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                        maxLength={500}
                        onChange={(event) =>
                          onNoteChange?.(row.date, event.target.value)
                        }
                        placeholder="Optional note"
                        value={row.uiNote}
                      />
                    ) : (
                      <span className="text-muted">{row.uiNote || "No note"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "slate" | "sky" | "emerald" | "amber" }) {
  const classes = {
    slate: "bg-slate-100 text-slate-700",
    sky: "bg-sky-100 text-sky-800",
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
      {text}
    </span>
  );
}

function badgeClass(
  entryType: TimesheetEntryType | null,
  isWeekend: boolean,
  isHoliday: boolean,
) {
  if (entryType === "ON_WORK") return "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800";
  if (entryType === "ON_LEAVE") return "inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800";
  if (isHoliday || entryType === "HOLIDAY") return "inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-800";
  if (isWeekend || entryType === "WEEKEND") return "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700";
  return "inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700";
}

function labelForEntry(
  entryType: TimesheetEntryType | null,
  isWeekend: boolean,
  isHoliday: boolean,
) {
  if (entryType === "ON_WORK") return "On Work";
  if (entryType === "ON_LEAVE") return "On Leave";
  if (entryType === "HOLIDAY" || isHoliday) return "Holiday";
  if (entryType === "WEEKEND" || isWeekend) return "Weekend";
  return "Unset";
}

function shortDay(dayOfWeek: string) {
  return dayOfWeek.slice(0, 3);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}
