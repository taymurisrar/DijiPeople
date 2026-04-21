import { CustomerListManager } from "@/app/_components/customer-list-manager";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["status", "subStatus", "industry", "accountManagerUserId", "selectedPlanId", "search", "page"]) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0) {
      query.set(key, value);
    }
  }
  query.set("pageSize", "50");

  const [customers, lifecycleOptions, operators, plans] = await Promise.all([
    apiRequestJson<PaginatedResponse<CustomerRecord>>(`/super-admin/customers?${query.toString()}`),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Customer lifecycle
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Customers</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Manage qualified business accounts separately from leads and tenants,
          then move them into onboarding only when the commercial path is ready.
        </p>
      </section>

      <CustomerListManager
        currentFilters={{
          status: typeof params.status === "string" ? params.status : undefined,
          subStatus: typeof params.subStatus === "string" ? params.subStatus : undefined,
          industry: typeof params.industry === "string" ? params.industry : undefined,
          accountManagerUserId:
            typeof params.accountManagerUserId === "string"
              ? params.accountManagerUserId
              : undefined,
          selectedPlanId:
            typeof params.selectedPlanId === "string"
              ? params.selectedPlanId
              : undefined,
          search: typeof params.search === "string" ? params.search : undefined,
        }}
        initialData={customers}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}
