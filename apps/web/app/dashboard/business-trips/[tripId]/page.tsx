import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { BusinessTripRecord } from "../business-trip-types";
import { BusinessTripActions } from "./_components/business-trip-actions";

type PageProps = { params: Promise<{ tripId: string }> };

export default async function BusinessTripDetailPage({ params }: PageProps) {
  const { tripId } = await params;
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_READ_ALL)) {
    return <AccessDeniedState title="Access denied" description="You do not have access to business trips." />;
  }
  const trip = await apiRequestJson<BusinessTripRecord>(`/business-trips/${tripId}`);
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted">{trip.status}</p>
            <h2 className="mt-3 font-serif text-4xl text-foreground">{trip.title}</h2>
            <p className="mt-3 text-muted">
              {trip.employee?.firstName} {trip.employee?.lastName} / {trip.destinationCity}, {trip.destinationCountry}
            </p>
            <p className="mt-2 text-sm text-muted">
              {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
            </p>
          </div>
          <BusinessTripActions
            canApprove={hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_APPROVE)}
            canCalculate={hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_UPDATE)}
            canCancel={hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_CANCEL)}
            canReject={hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_REJECT)}
            canSubmit={hasPermission(user.permissionKeys, PERMISSION_KEYS.BUSINESS_TRIPS_UPDATE)}
            status={trip.status}
            tripId={trip.id}
          />
        </div>
      </section>
      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Allowance breakdown</h3>
            <p className="text-sm text-muted">Approved total: {trip.currencyCode} {trip.approvedAllowance}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {trip.allowances.length ? trip.allowances.map((allowance) => (
            <div className="rounded-2xl border border-border bg-white p-4" key={allowance.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{formatLabel(allowance.allowanceType)}</p>
                  <p className="text-sm text-muted">{formatLabel(allowance.calculationBasis)} / quantity {allowance.quantity} at {allowance.rate}</p>
                </div>
                <p className="font-semibold">{allowance.currencyCode} {allowance.amount}</p>
              </div>
            </div>
          )) : <p className="text-sm text-muted">No allowance lines calculated yet.</p>}
        </div>
      </section>
    </main>
  );
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
