import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { ClaimForm } from "../_components/claim-form";

export default async function NewClaimPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_CREATE)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to create claims."
      />
    );
  }
  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Claims</p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">New claim</h2>
      </section>
      <ClaimForm
        basePath="/api/claims"
        detailBasePath="/claims"
        allowEmployeePicker
        canEditHeader
        canSubmit={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CLAIMS_UPDATE,
        )}
        canManagerApprove={false}
        canPayrollApprove={false}
        canReject={false}
        canCancel={false}
      />
    </div>
  );
}
