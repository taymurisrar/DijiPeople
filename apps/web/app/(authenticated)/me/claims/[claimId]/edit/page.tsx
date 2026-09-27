import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../../_components/access-denied-state";
import { ClaimForm } from "../../../../claims/_components/claim-form";
import { ClaimRecord } from "../../../../claims/claim-types";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function EditMyClaimPage({ params }: PageProps) {
  const { claimId } = await params;
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_OWN)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to this claim."
      />
    );
  }
  const claim = await apiRequestJson<ClaimRecord>(`/me/claims/${claimId}`);
  const canEdit = hasPermission(
    user.permissionKeys,
    PERMISSION_KEYS.CLAIMS_CREATE,
  );
  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">
          {claim.status}
        </p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">
          {claim.title}
        </h2>
      </section>
      <ClaimForm
        basePath="/api/me/claims"
        detailBasePath="/me/claims"
        initialClaim={claim}
        allowEmployeePicker={false}
        canEditHeader={canEdit}
        canSubmit={canEdit}
        canManagerApprove={false}
        canPayrollApprove={false}
        canReject={false}
        canCancel={false}
      />
    </div>
  );
}
