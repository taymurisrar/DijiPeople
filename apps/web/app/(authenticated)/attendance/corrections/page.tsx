import {
  AttendanceCorrectionsTable,
  AttendanceCorrectionViewTabs,
} from "@/app/components/attendance-corrections/attendance-corrections-table";
import type { AttendanceCorrectionListResponse } from "@/app/components/attendance-corrections/attendance-correction-types";
import Link from "next/link";
import { requireSessionUser } from "@/lib/auth";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { hasAnyPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS, ROLE_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";

type AttendanceCorrectionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const READ_PERMISSION_KEYS = [
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ_OWN,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_READ_TEAM,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_APPROVE,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_REJECT,
  PERMISSION_KEYS.ATTENDANCE_CORRECTION_MANAGE,
];

export default async function AttendanceCorrectionsPage({
  searchParams,
}: AttendanceCorrectionsPageProps) {
  const user = await requireSessionUser("/");
  if (!canUseCorrectionWorkflow(user)) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance correction workflow access."
          title="Attendance corrections are unavailable for your account."
        />
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = buildQuery(resolvedSearchParams);
  const response = await apiRequestJson<AttendanceCorrectionListResponse>(
    `/attendance/correction-requests${query ? `?${query}` : ""}`,
  );

  return (
    <main className="dp-theme-scope dp-attendance-scope space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Attendance workflow
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Attendance Corrections
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Submitted correction requests, assigned approvals, and workflow
          history for attendance records.
        </p>
        {canCreateCorrectionRequest(user) ? (
          <Link
            className="mt-4 inline-flex rounded-xl border border-accent/30 bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/attendance/corrections/new"
          >
            New correction request
          </Link>
        ) : null}
      </section>
      <AttendanceCorrectionViewTabs />
      <AttendanceCorrectionsTable response={response} />
    </main>
  );
}

function canUseCorrectionWorkflow(user: {
  permissionKeys: string[];
  roleKeys?: string[] | null;
}) {
  return (
    hasAnyPermission(user.permissionKeys, READ_PERMISSION_KEYS) ||
    hasElevatedTenantRole(user.roleKeys) ||
    (user.roleKeys ?? []).some(
      (roleKey) => roleKey === ROLE_KEYS.MANAGER || roleKey === ROLE_KEYS.HR,
    )
  );
}

function canCreateCorrectionRequest(user: {
  permissionKeys: string[];
  roleKeys?: string[] | null;
}) {
  return (
    hasAnyPermission(user.permissionKeys, [
      PERMISSION_KEYS.ATTENDANCE_CORRECTION_CREATE,
      PERMISSION_KEYS.ATTENDANCE_READ,
      PERMISSION_KEYS.ATTENDANCE_READ_OWN,
      PERMISSION_KEYS.ATTENDANCE_READ_TEAM,
      PERMISSION_KEYS.ATTENDANCE_READ_ALL,
    ]) || canUseCorrectionWorkflow(user)
  );
}

function buildQuery(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }
  return search.toString();
}
