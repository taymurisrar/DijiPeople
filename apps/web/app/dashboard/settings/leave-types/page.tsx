import Link from "next/link";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatEnumLabel } from "@/lib/common";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { LeaveTypeRecord } from "../types";

export default async function LeaveTypesPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.LEAVE_TYPES_READ]);

  const leaveTypes = await apiRequestJson<LeaveTypeRecord[]>("/leave-types");

  const totalLeaveTypes = leaveTypes.length;
  const activeLeaveTypes = leaveTypes.filter((item) => item.isActive).length;
  const approvalRequired = leaveTypes.filter(
    (item) => item.requiresApproval,
  ).length;

  return (
    <SettingsShell
      description="Leave types define the business-facing categories employees and managers will work with later, without hardcoding tenant rules."
      eyebrow="Leave Settings"
      title="Leave Types"
    >
      <section className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Total types" value={totalLeaveTypes} />
          <MetricCard label="Active types" value={activeLeaveTypes} />
          <MetricCard label="Approval required" value={approvalRequired} />
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                Leave Type Catalog
              </p>

              <h3 className="mt-2 text-2xl font-semibold text-foreground">
                Tenant-defined leave categories
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Configure the leave categories available to employees and
                managers. These records stay reusable across policies, approval
                matrices, payroll, and entitlement rules.
              </p>
            </div>

            <Link
              className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
              href="/dashboard/settings/leave-types/new"
            >
              Add leave type
            </Link>
          </div>

          {leaveTypes.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mt-6 overflow-hidden">
              <table className="w-full table-fixed border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted">
                    <th className="w-[30%] px-4">Leave Type</th>
                    <th className="w-[16%] px-4">Category</th>
                    <th className="w-[14%] px-4">Payment</th>
                    <th className="w-[16%] px-4">Approval</th>
                    <th className="w-[14%] px-4">Status</th>
                    <th className="w-[10%] px-4 text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {leaveTypes.map((leaveType) => (
                    <tr
                      key={leaveType.id}
                      className="rounded-2xl border border-border bg-white shadow-sm"
                    >
                      <td className="rounded-l-2xl px-4 py-4">
                        <p className="truncate font-semibold text-foreground">
                          {leaveType.name}
                        </p>
                        <p className="mt-1 truncate text-sm text-muted">
                          Code: {leaveType.code}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-sm font-medium text-foreground">
                        {formatEnumLabel(leaveType.category) || "Not categorized"}
                      </td>

                      <td className="px-4 py-4 text-sm text-foreground">
                        {leaveType.isPaid ? "Paid" : "Unpaid"}
                      </td>

                      <td className="px-4 py-4 text-sm text-foreground">
                        {leaveType.requiresApproval ? "Required" : "Not Required"}
                      </td>

                      <td className="px-4 py-4">
                        <StatusPill
                          tone={leaveType.isActive ? "good" : "danger"}
                        >
                          {leaveType.isActive ? "Active" : "Inactive"}
                        </StatusPill>
                      </td>

                      <td className="rounded-r-2xl px-4 py-4 text-right">
                        <Link
                          className="inline-flex rounded-xl border border-border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/5"
                          href={`/dashboard/settings/leave-types/${leaveType.id}/edit`}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </SettingsShell>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 rounded-[24px] border border-dashed border-border bg-white/80 p-10 text-center">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        No leave types yet
      </p>

      <h4 className="mt-3 text-xl font-semibold text-foreground">
        Start building your leave catalog
      </h4>

      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
        Start with annual, sick, unpaid, or compensatory leave, then tailor
        categories to each tenant&apos;s policies later.
      </p>

      <Link
        className="mt-6 inline-flex rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
        href="/dashboard/settings/leave-types/new"
      >
        Create first leave type
      </Link>
    </div>
  );
}
