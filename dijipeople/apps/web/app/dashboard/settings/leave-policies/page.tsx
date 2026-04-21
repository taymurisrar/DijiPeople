import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { LeavePolicyRecord } from "../types";

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function LeavePoliciesPage() {
  const leavePolicies = await apiRequestJson<LeavePolicyRecord[]>(
    "/leave-policies",
  );

  return (
    <SettingsShell
      description="Leave policies hold entitlement and restriction rules so leave operations stay configuration-driven per tenant."
      eyebrow="Leave Settings"
      title="Leave Policies"
    >
      <section className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Leave Policy Catalog
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              Entitlement and accrual rules
            </h3>
          </div>
          <Link
            className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href="/dashboard/settings/leave-policies/new"
          >
            Add leave policy
          </Link>
        </div>

        {leavePolicies.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-border bg-white/80 p-10 text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              No leave policies yet
            </p>
            <p className="mt-3 text-muted">
              Set up annual or monthly accrual policies before building leave
              requests and approvals.
            </p>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th className="px-4">Name</th>
                <th className="px-4">Accrual</th>
                <th className="px-4">Entitlement</th>
                <th className="px-4">Carry Forward</th>
                <th className="px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {leavePolicies.map((policy) => (
                <tr
                  key={policy.id}
                  className="rounded-2xl border border-border bg-white shadow-sm"
                >
                  <td className="rounded-l-2xl px-4 py-4">
                    <p className="font-medium text-foreground">{policy.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      {policy.isActive ? "Active" : "Inactive"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {formatLabel(policy.accrualType)}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {policy.annualEntitlement} days
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground">
                    {policy.carryForwardAllowed
                      ? `${policy.carryForwardLimit || "No cap"}`
                      : "Not allowed"}
                  </td>
                  <td className="rounded-r-2xl px-4 py-4">
                    <Link
                      className="text-sm font-medium text-accent transition hover:text-accent-strong"
                      href={`/dashboard/settings/leave-policies/${policy.id}/edit`}
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
