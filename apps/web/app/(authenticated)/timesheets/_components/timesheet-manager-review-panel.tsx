import { PermissionGate } from "../../_components/permission-gate";
import type { TimesheetRecord } from "../types";
import { TimesheetMONTHLYEditor } from "./timesheet-monthly-editor";

export function TimesheetManagerReviewPanel({
  timesheet,
}: {
  timesheet: TimesheetRecord;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <PermissionGate permission="timesheets.export">
          <a
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground"
            href={`/api/timesheets/${timesheet.id}/export`}
          >
            Export current record
          </a>
        </PermissionGate>
      </div>
      <TimesheetMONTHLYEditor timesheet={timesheet} />
    </div>
  );
}
