import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { ClaimRecord } from "../claim-types";
import { ClaimActions } from "./_components/claim-actions";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimDetailPage({ params }: PageProps) {
  const { claimId } = await params;
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_ALL)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to claims." />;
  }
  const claim = await apiRequestJson<ClaimRecord>(`/claims/${claimId}`);
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">{claim.status}</p>
            <h2 className="mt-3 font-serif text-4xl text-foreground">{claim.title}</h2>
            <p className="mt-3 text-muted">{claim.employee?.firstName} {claim.employee?.lastName} / {claim.currencyCode} {claim.approvedAmount}</p>
          </div>
          <ClaimActions
            claimId={claim.id}
            status={claim.status}
            canSubmit={hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_UPDATE)}
            canManagerApprove={hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_MANAGER_APPROVE)}
            canPayrollApprove={hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_PAYROLL_APPROVE)}
            canReject={hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_REJECT)}
            canCancel={hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_CANCEL)}
          />
        </div>
      </section>
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-foreground">Line items</h3>
        <div className="mt-4 grid gap-3">
          {claim.lineItems.map((line) => (
            <div className="rounded-2xl border border-border bg-white p-4" key={line.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{line.claimSubType?.name ?? line.claimType?.name}</p>
                  <p className="text-sm text-muted">{line.vendor ?? "No vendor"} / {line.description ?? "No description"}</p>
                </div>
                <p className="font-semibold">{line.currencyCode} {line.approvedAmount ?? line.amount}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
