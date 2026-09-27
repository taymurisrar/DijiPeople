import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { ClaimForm } from "../../_components/claim-form";
import { ClaimRecord } from "../../claim-types";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function EditClaimPage({ params }: PageProps) {
  const { claimId } = await params;
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_ALL)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="You do not have access to claims."
      />
    );
  }
  const claim = await apiRequestJson<ClaimRecord>(`/claims/${claimId}`);
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
        basePath="/api/claims"
        detailBasePath="/claims"
        initialClaim={claim}
        allowEmployeePicker={false}
        canEditHeader={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CLAIMS_UPDATE,
        )}
        canSubmit={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CLAIMS_UPDATE,
        )}
        canManagerApprove={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CLAIMS_MANAGER_APPROVE,
        )}
        canPayrollApprove={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CLAIMS_PAYROLL_APPROVE,
        )}
        canReject={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CLAIMS_REJECT,
        )}
        canCancel={hasPermission(
          user.permissionKeys,
          PERMISSION_KEYS.CLAIMS_CANCEL,
        )}
      />
    </div>
  );
}
