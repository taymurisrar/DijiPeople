import { StandardModuleRecordPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildPublishedStandardRouteRuntime,
  resolveStandardActiveForm,
} from "@/lib/runtime/modules/standard-module-route-helpers";
import { timesheetRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import type { TimesheetRecord } from "../types";

type PageProps = {
  params: Promise<{ timesheetId: string }>;
  searchParams?: Promise<{ formId?: string }>;
};

export default async function TimesheetDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [{ timesheetId }, resolvedSearchParams, sessionUser] =
    await Promise.all([
      params,
      searchParams ?? Promise.resolve({} as { formId?: string }),
      getSessionUser(),
    ]);
  const timesheet = await apiRequestJson<TimesheetRecord>(
    `/timesheets/${timesheetId}`,
  );
  const runtime = await buildPublishedStandardRouteRuntime({
    pageKind: "detail",
    recordId: timesheet.id,
    sessionUser,
    spec: timesheetRuntimeSpec,
  });
  const activeForm = resolveStandardActiveForm(
    runtime.metadata.forms,
    resolvedSearchParams.formId ?? "",
  );

  return (
    <main className="grid gap-6">
      <StandardModuleRecordPage
        activeForm={activeForm}
        mode="read"
        record={{
          ...timesheet,
          timesheetName: `${timesheet.employee.fullName} ${timesheet.year}-${String(timesheet.month).padStart(2, "0")}`,
          employeeName: timesheet.employee.fullName,
          period: `${timesheet.periodStart} - ${timesheet.periodEnd}`,
        }}
        recordId={timesheet.id}
        runtime={runtime}
        spec={timesheetRuntimeSpec}
        title="Timesheet"
      />
    </main>
  );
}
