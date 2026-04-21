import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { LeaveTypeRecord } from "../types";

export default async function LeaveTypesPage() {
  const leaveTypes = await apiRequestJson<LeaveTypeRecord[]>("/leave-types");

  return (
    <SettingsShell
      description="Leave types define the business-facing categories employees and managers will work with later, without hardcoding tenant rules."
      eyebrow="Leave Settings"
      title="Leave Types"
    >
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Leave Type Catalog
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Tenant-defined leave categories
            </h3>
          </div>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/settings/leave-types/new"
          >
            Add leave type
          </Link>
        </div>

        {leaveTypes.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-border bg-white/80 p-10 text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              No leave types yet
            </p>
            <p className="mt-3 text-muted">
              Start with annual, sick, or unpaid leave, then tailor categories
              to each tenant&apos;s policies later.
            </p>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-4">Name</th>
                <th className="px-4">Category</th>
                <th className="px-4">Paid</th>
                <th className="px-4">Approval</th>
                <th className="px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((leaveType) => (
                <tr
                  key={leaveType.id}
                  className="rounded-2xl border border-border bg-white shadow-sm"
                >
                  <td className="rounded-l-2xl px-4 py-4">
                    <p className="font-medium text-foreground">
                      {leaveType.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">{leaveType.code}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {leaveType.category}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {leaveType.isPaid ? "Paid" : "Unpaid"}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {leaveType.requiresApproval ? "Required" : "Not required"}
                  </td>
                  <td className="rounded-r-2xl px-4 py-4">
                    <Link
                      className="text-sm font-medium text-accent transition hover:text-accent-strong"
                      href={`/dashboard/settings/leave-types/${leaveType.id}/edit`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </SettingsShell>
  );
}
