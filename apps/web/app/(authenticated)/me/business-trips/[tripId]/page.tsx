import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../../_components/access-denied-state";
import { BusinessTripRecord } from "../../../business-trips/business-trip-types";

type PageProps = { params: Promise<{ tripId: string }> };

export default async function MyBusinessTripDetailPage({ params }: PageProps) {
  const { tripId } = await params;
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_READ_OWN)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to this business trip." />;
  }
  const trip = await apiRequestJson<BusinessTripRecord>(`/me/business-trips/${tripId}`);
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">{trip.status}</p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">{trip.title}</h2>
        <p className="mt-3 text-muted">{trip.destinationCity}, {trip.destinationCountry} / {trip.currencyCode} {trip.approvedAllowance}</p>
      </section>
      <section className="grid gap-3">
        {trip.allowances.map((allowance) => (
          <div className="rounded-2xl border border-border bg-white p-4" key={allowance.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <p className="font-medium">{allowance.allowanceType.replaceAll("_", " ")}</p>
              <p>{allowance.currencyCode} {allowance.amount}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
