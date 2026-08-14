import { SectionCard } from "@/app/components/ui/section-card";
import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { AttendanceExceptionsTable } from "./_components/attendance-exceptions-table";
import { AttendanceExceptionFilters } from "./_components/attendance-exception-filters";
import { AttendanceExceptionSummary } from "./_components/attendance-exception-summary";
import type {
  AttendanceExceptionListResponse,
  AttendanceExceptionSummaryResponse,
} from "./_lib/types";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Where a manager or HR triages what the engine could not resolve.
 *
 * SCOPE IS THE SERVER'S. This page passes filters and renders what comes back;
 * which employees the caller may see is decided by the same attendance
 * permissions the rest of the module uses. The summary counts come from the same
 * scoped queries as the list, so the number in the tile always matches the rows
 * behind it — a count that advertised work the reader cannot open would be worse
 * than no count.
 */
export default async function AttendanceExceptionsPage({
  searchParams,
}: PageProps) {
  const user = await requireSessionUser("/");

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.ATTENDANCE_READ])) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance access."
          title="Attendance exceptions are unavailable for your account."
        />
      </main>
    );
  }

  const resolved = searchParams ? await searchParams : {};
  const query = buildQuery(resolved);

  const [list, summary] = await Promise.all([
    apiRequestJson<AttendanceExceptionListResponse>(
      `/attendance/engine/exceptions${query ? `?${query}` : ""}`,
    ).catch(emptyList),
    apiRequestJson<AttendanceExceptionSummaryResponse>(
      `/attendance/engine/exceptions/summary${dateOnlyQuery(resolved)}`,
    ).catch(emptySummary),
  ]);

  const canManage = hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.ATTENDANCE_MANAGE]);

  return (
    <main className="dp-theme-scope dp-attendance-scope grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold text-foreground">
          Attendance exceptions
        </h1>
        <p className="text-sm text-muted">
          Days DijiPeople could not resolve on its own. Everything here is
          recorded attendance — reviewing it decides how it counts, not whether
          it happened.
        </p>
      </header>

      <AttendanceExceptionSummary summary={summary} />

      <SectionCard
        title="Open items"
        description="Filtered to what you have access to."
      >
        <AttendanceExceptionFilters current={resolved} />
        <AttendanceExceptionsTable
          canManage={canManage}
          items={list.items}
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
        />
      </SectionCard>
    </main>
  );
}

/**
 * Only the filters the API accepts are forwarded.
 *
 * An unrecognised parameter is dropped rather than passed through: the API
 * rejects unknown query fields, and silently failing the whole page because
 * someone shared a URL with a stray parameter would be a poor trade.
 */
function buildQuery(
  params: Record<string, string | string[] | undefined>,
): string {
  const allowed = [
    "employeeId",
    "departmentId",
    "workSiteId",
    "type",
    "status",
    "from",
    "to",
    "page",
    "pageSize",
  ];

  const search = new URLSearchParams();
  for (const key of allowed) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) search.set(key, single);
  }

  return search.toString();
}

function dateOnlyQuery(
  params: Record<string, string | string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const key of ["from", "to"]) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) search.set(key, single);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * An unreachable API yields an empty workspace with its own message rather than
 * a crashed page. The alternative shows a stack trace to someone whose job is
 * to review attendance.
 */
function emptyList(): AttendanceExceptionListResponse {
  return { items: [], page: 1, pageSize: 25, total: 0 };
}

function emptySummary(): AttendanceExceptionSummaryResponse {
  return {
    open: 0,
    critical: 0,
    missingPunch: 0,
    leaveConflict: 0,
    workSiteConflict: 0,
    lockedPeriod: 0,
  };
}
