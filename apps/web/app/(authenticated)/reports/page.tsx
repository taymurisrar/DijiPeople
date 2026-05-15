import { getSessionUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import { getBusinessUnitAccessSummary, hasBusinessUnitScope } from "../_lib/business-unit-access";
import { ReportsOverview } from "./_components/reports-overview";
import {
  AttendanceSummary,
  HeadcountSummary,
  LeaveSummary,
  RecruitmentSummary,
} from "./types";

export default async function ReportsPage() {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-8">
        <AccessDeniedState
          description="Your current business-unit scope does not include reportable records."
          title="Reports are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const [headcountSummary, leaveSummary, attendanceSummary, recruitmentSummary] =
    await Promise.all([
      user.permissionKeys.includes("employees.read")
        ? apiRequestJson<HeadcountSummary>("/reports/headcount-summary")
        : Promise.resolve(null),
      user.permissionKeys.includes("leave-requests.read")
        ? apiRequestJson<LeaveSummary>("/reports/leave-summary")
        : Promise.resolve(null),
      user.permissionKeys.includes("attendance.read")
        ? apiRequestJson<AttendanceSummary>("/reports/attendance-summary")
        : Promise.resolve(null),
      user.permissionKeys.includes("recruitment.read")
        ? apiRequestJson<RecruitmentSummary>("/reports/recruitment-summary")
        : Promise.resolve(null),
    ]);

  return (
    <main className="grid gap-8">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(224,242,254,0.9))] p-8 shadow-lg">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          Analytics
        </p>
        <h1 className="mt-3 font-serif text-4xl text-foreground">
          Reports and Summaries
        </h1>
        <p className="mt-3 max-w-3xl text-muted">
          Track high-value workforce, leave, attendance, and hiring signals
          without leaving the platform. This reporting layer is intentionally
          lightweight so we can keep expanding it cleanly over time.
        </p>
      </section>

      <ReportsOverview
        attendanceSummary={attendanceSummary}
        headcountSummary={headcountSummary}
        leaveSummary={leaveSummary}
        recruitmentSummary={recruitmentSummary}
      />
    </main>
  );
}
