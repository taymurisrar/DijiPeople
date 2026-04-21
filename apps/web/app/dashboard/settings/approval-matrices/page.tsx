import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../_components/settings-shell";
import { requireSettingsPermissions } from "../_lib/require-settings-permission";
import { ApprovalMatrixRecord } from "../types";

export default async function ApprovalMatricesPage() {
  await requireSettingsPermissions(["leave-policies.read"]);
  const approvalMatrices = await apiRequestJson<ApprovalMatrixRecord[]>(
    "/approval-matrices",
  );

  return (
    <SettingsShell
      description="Review tenant leave approval routing so requests follow the right manager and policy sequence."
      eyebrow="Leave & Holidays"
      title="Approval Matrix"
    >
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Approval routing
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-foreground">
              {approvalMatrices.length} approval step
              {approvalMatrices.length === 1 ? "" : "s"}
            </h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {approvalMatrices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-white/80 px-4 py-4 text-sm text-muted">
              No approval matrix entries have been configured for this tenant yet.
            </div>
          ) : (
            approvalMatrices.map((matrix) => (
              <div
                className="rounded-2xl border border-border bg-white/80 px-4 py-4"
                key={matrix.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{matrix.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      Sequence {matrix.sequence} • {matrix.approverType}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      Leave type: {matrix.leaveType?.name || "All leave types"} • Policy:{" "}
                      {matrix.leavePolicy?.name || "All policies"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      matrix.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-surface text-muted"
                    }`}
                  >
                    {matrix.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </article>
    </SettingsShell>
  );
}
