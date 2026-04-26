import Link from "next/link";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import { TimesheetListResponse } from "../types";

export function TimesheetMonthsTable({
  basePath,
  response,
  searchParams,
}: {
  basePath: string;
  response: TimesheetListResponse;
  searchParams: Record<string, string | undefined>;
}) {
  if (response.items.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        No monthly timesheets match this filter set.
      </p>
    );
  }

  return (
    <div className="mt-5 grid gap-4">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white/90">
            {response.items.map((timesheet) => (
              <tr key={timesheet.id}>
                <td className="px-4 py-3 font-medium text-foreground">
                  {monthLabel(timesheet.month, timesheet.year)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{timesheet.employee.fullName}</p>
                  <p className="text-xs text-muted">
                    {[timesheet.employee.department?.name, timesheet.employee.businessUnit?.name]
                      .filter(Boolean)
                      .join(" / ") || "No org context"}
                  </p>
                </td>
                <td className="px-4 py-3">{timesheet.status}</td>
                <td className="px-4 py-3 text-muted">
                  {timesheet.summary.totalWorkDays} work, {timesheet.summary.totalLeaveDays} leave, {timesheet.summary.totalHours.toFixed(2)} hrs
                </td>
                <td className="px-4 py-3 text-muted">
                  {timesheet.employee.reportingManager
                    ? `${timesheet.employee.reportingManager.firstName} ${timesheet.employee.reportingManager.lastName}`
                    : "Unassigned"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="text-sm font-semibold text-accent hover:text-accent-strong"
                    href={`${basePath}?year=${timesheet.year}&month=${timesheet.month}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DataTablePagination
        page={response.meta.page}
        pageSize={response.meta.pageSize}
        pathname={basePath}
        searchParams={searchParams}
        totalItems={response.meta.total}
      />
    </div>
  );
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
