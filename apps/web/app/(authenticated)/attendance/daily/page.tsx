import Link from "next/link";

import { SectionCard } from "@/app/components/ui/section-card";
import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { TeamDayViewTabs } from "./_components/team-day-view-tabs";
import { TeamDaysTable } from "./_components/team-days-table";
import { shiftDateKey } from "./_lib/format";
import {
  isTeamDayView,
  teamDayViewDescription,
  teamDayViewLabel,
  type TeamDayResponse,
  type TeamDayViewKey,
} from "./_lib/views";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const DEFAULT_VIEW: TeamDayViewKey = "NEEDS_REVIEW";

/**
 * Daily review of reconciled attendance across a team.
 *
 * WHY THIS SITS BESIDE THE EXISTING TEAM PAGE rather than replacing it. That page
 * lists AttendanceEntry records — one check-in, one check-out, manual entry and
 * imports. Exception counts, correction status, reconciliation state and derived
 * work mode have no column there and no meaning in that model. This is the
 * reconciled view of the same days; it links back to the existing record page and
 * to the exception workspace rather than duplicating either.
 *
 * SCOPE AND COUNTS ARE THE SERVER'S. Which employees appear is decided by the
 * same attendance permissions as the rest of the module, and every view is a
 * database predicate. Filtering in the browser would report "3 hybrid days" when
 * the real answer was ninety, and a count that only describes page one is worse
 * than no count at all.
 */
export default async function AttendanceDailyReviewPage({
  searchParams,
}: PageProps) {
  const user = await requireSessionUser("/");

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.ATTENDANCE_READ])) {
    return (
      <div className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance access."
          title="Daily attendance review is unavailable for your account."
        />
      </div>
    );
  }

  const resolved = searchParams ? await searchParams : {};
  const single = (key: string): string | undefined => {
    const raw = resolved[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  // A fortnight by default: enough to cover last week's outstanding days on a
  // Monday morning without turning the page into a report.
  const to = single("to") ?? todayKey();
  const from = single("from") ?? shiftDateKey(to, -13);

  const requestedView = single("view");
  const view =
    requestedView && isTeamDayView(requestedView) ? requestedView : DEFAULT_VIEW;

  const search = new URLSearchParams({ from, to, view });
  for (const key of ["employeeId", "departmentId", "page"]) {
    const value = single(key);
    if (value) search.set(key, value);
  }

  const data = await apiRequestJson<TeamDayResponse>(
    `/attendance/engine/team-days?${search.toString()}`,
  ).catch(
    (): TeamDayResponse => ({
      view,
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
    }),
  );

  return (
    <div className="dp-theme-scope dp-attendance-scope grid gap-6">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-foreground">
          Daily attendance review
        </h2>
        <p className="text-sm text-muted">
          Reconciled attendance for the people you manage. Use the views to find
          the days that still need a decision.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-accent hover:underline" href="/attendance/team">
            Team attendance
          </Link>
          <Link
            className="text-accent hover:underline"
            href="/attendance/exceptions"
          >
            Exception workspace
          </Link>
        </div>
      </header>

      <TeamDayViewTabs current={view} search={search.toString()} />

      <SectionCard
        description={teamDayViewDescription(view) ?? undefined}
        title={`${teamDayViewLabel(view)} · ${from} to ${to}`}
      >
        <TeamDaysTable
          items={data.items}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      </SectionCard>
    </div>
  );
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
