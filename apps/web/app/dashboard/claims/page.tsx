import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import { ClaimRecord } from "./claim-types";

export default async function ClaimsPage() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.CLAIMS_READ_ALL)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to claims." />;
  }
  const claims = await apiRequestJson<ClaimRecord[]>("/claims");
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Claims</p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">Claims & Reimbursements</h2>
        <p className="mt-3 max-w-3xl text-muted">Review employee claims and move approved reimbursements into payroll.</p>
      </section>
      <section className="grid gap-3">
        {claims.length ? claims.map((claim) => (
          <Link className="rounded-2xl border border-border bg-white p-4 transition hover:border-accent/40" href={`/dashboard/claims/${claim.id}`} key={claim.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{claim.title}</p>
                <p className="text-sm text-muted">{claim.employee?.firstName} {claim.employee?.lastName} / {claim.status}</p>
              </div>
              <p className="font-semibold">{claim.currencyCode} {claim.approvedAmount}</p>
            </div>
          </Link>
        )) : <p className="text-sm text-muted">No claims found.</p>}
      </section>
    </main>
  );
}
