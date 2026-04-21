import { OnboardingListManager } from "@/app/_components/onboarding-list-manager";
import type {
  CustomerOnboardingRecord,
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["status", "subStatus", "customerId", "onboardingOwnerUserId", "search", "page"]) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0) {
      query.set(key, value);
    }
  }
  query.set("pageSize", "50");

  const [onboarding, lifecycleOptions, operators, customersResponse, plans] = await Promise.all([
    apiRequestJson<PaginatedResponse<CustomerOnboardingRecord>>(`/super-admin/customer-onboarding?${query.toString()}`),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PaginatedResponse<CustomerRecord>>("/super-admin/customers?pageSize=200"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Operational readiness
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Onboarding</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Move approved customers through readiness, confirm commercial and setup milestones,
          then create tenants only when the customer is active and the checklist is complete.
        </p>
      </section>

      <OnboardingListManager
        currentFilters={{
          status: typeof params.status === "string" ? params.status : undefined,
          subStatus: typeof params.subStatus === "string" ? params.subStatus : undefined,
          customerId: typeof params.customerId === "string" ? params.customerId : undefined,
          onboardingOwnerUserId:
            typeof params.onboardingOwnerUserId === "string"
              ? params.onboardingOwnerUserId
              : undefined,
          search: typeof params.search === "string" ? params.search : undefined,
        }}
        customers={customersResponse.items}
        initialData={onboarding}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}
