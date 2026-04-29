import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { ClaimRecord } from "../../../claims/claim-types";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function MyClaimDetailPage({ params }: PageProps) {
  const { claimId } = await params;
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_OWN)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to this claim." />;
  }
  const claim = await apiRequestJson<ClaimRecord>(`/me/claims/${claimId}`);
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">{claim.status}</p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">{claim.title}</h2>
        <p className="mt-3 text-muted">{claim.currencyCode} {claim.approvedAmount}</p>
      </section>
      <section className="grid gap-3">
        {claim.lineItems.map((line) => (
          <div className="rounded-2xl border border-border bg-white p-4" key={line.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <p className="font-medium">{line.claimSubType?.name ?? line.claimType?.name}</p>
              <p>{line.currencyCode} {line.approvedAmount ?? line.amount}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
