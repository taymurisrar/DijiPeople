import Link from "next/link";
import { AttendanceCorrectionForm } from "@/app/components/attendance-corrections/attendance-correction-form";
import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../../_components/access-denied-state";

export default async function NewAttendanceCorrectionPage() {
  const user = await requireSessionUser("/");
  if (
    !hasAnyPermission(user.permissionKeys, [
      PERMISSION_KEYS.ATTENDANCE_CORRECTION_CREATE,
      PERMISSION_KEYS.ATTENDANCE_READ,
      PERMISSION_KEYS.ATTENDANCE_READ_OWN,
      PERMISSION_KEYS.ATTENDANCE_READ_TEAM,
      PERMISSION_KEYS.ATTENDANCE_READ_ALL,
    ])
  ) {
    return (
      <main className="dp-theme-scope dp-attendance-scope grid gap-6">
        <AccessDeniedState
          description="Your role does not include attendance correction submission."
          title="Attendance correction submission is unavailable."
        />
      </main>
    );
  }

  return (
    <main className="dp-theme-scope dp-attendance-scope space-y-6">
      <section>
        <Link
          className="text-sm font-medium text-accent transition hover:text-accent-strong"
          href="/attendance/corrections"
        >
          Back to corrections
        </Link>
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Attendance workflow
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          New Correction Request
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Submit a timestamp correction for manager review. The attendance
          record is updated only after approval.
        </p>
      </section>
      <AttendanceCorrectionForm />
    </main>
  );
}
