import { redirect } from "next/navigation";
import { apiRequestJson } from "@/lib/server-api";
import type { TimesheetRecord } from "../types";

export default async function NewTimesheetPage() {
  const timesheet = await apiRequestJson<TimesheetRecord>(
    "/timesheets/mine/monthly",
  );

  redirect(`/timesheets/${timesheet.id}`);
}
