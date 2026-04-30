import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import { BusinessTripRecord } from "./business-trip-types";

export default async function BusinessTripsPage() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_READ_ALL)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to business trips." />;
  }
  const trips = await apiRequestJson<BusinessTripRecord[]>("/business-trips");
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Travel</p>
        <h2 className="mt-3 font-serif text-4xl text-foreground">Business Trips</h2>
        <p className="mt-3 max-w-3xl text-muted">Review trip requests, approvals, and payroll-ready TA/DA allowances.</p>
      </section>
      <section className="grid gap-3">
        {trips.length ? trips.map((trip) => (
          <Link className="rounded-2xl border border-border bg-white p-4 transition hover:border-accent/40" href={`/dashboard/business-trips/${trip.id}`} key={trip.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{trip.title}</p>
                <p className="text-sm text-muted">
                  {trip.employee?.firstName} {trip.employee?.lastName} / {trip.destinationCity}, {trip.destinationCountry} / {trip.status}
                </p>
              </div>
              <p className="font-semibold">{trip.currencyCode} {trip.approvedAllowance}</p>
            </div>
          </Link>
        )) : <p className="text-sm text-muted">No business trips found.</p>}
      </section>
    </main>
  );
}
