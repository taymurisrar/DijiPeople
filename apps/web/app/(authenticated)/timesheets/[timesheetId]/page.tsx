import { apiRequestJson } from "@/lib/server-api";
import { TimesheetMONTHLYEditor } from "../_components/timesheet-monthly-editor";
import type { TimesheetRecord } from "../types";

type PageProps = {
  params: Promise<{ timesheetId: string }>;
};

export default async function TimesheetDetailPage({ params }: PageProps) {
  const { timesheetId } = await params;
  const timesheet = await apiRequestJson<TimesheetRecord>(
    `/timesheets/${timesheetId}`,
  );
  const [projectOptions, workLocationOptions] = await Promise.all([
      timesheet.canCurrentUserEdit
        ? apiRequestJson<AssignedProjectOption[]>(
            "/projects/assigned/me",
          ).catch(() => [])
        : Promise.resolve([]),
      timesheet.canCurrentUserEdit
        ? apiRequestJson<LookupResponse>("/locations?isActive=true")
            .then(lookupItems)
            .catch(() => [])
        : Promise.resolve([]),
    ]);

  return (
    <main className="grid gap-6">
      <TimesheetMONTHLYEditor
        projectOptions={projectOptions}
        timesheet={timesheet}
        workLocationOptions={workLocationOptions}
      />
    </main>
  );
}

type AssignedProjectOption = {
  readonly id: string;
  readonly name: string;
  readonly code?: string | null;
  readonly projectAssignmentId?: string | null;
  readonly billable?: boolean;
  readonly assignmentStartDate?: string | null;
  readonly assignmentEndDate?: string | null;
};
type LookupResponse =
  | AssignedProjectOption[]
  | { items?: AssignedProjectOption[] };
function lookupItems(response: LookupResponse) {
  return Array.isArray(response) ? response : (response.items ?? []);
}
