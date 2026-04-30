import {
  TenantListManager,
  type TenantSummary,
} from "@/app/_components/tenant-list-manager";
import { apiRequestJson } from "@/lib/server-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const key of [
    "status",
    "subscriptionStatus",
    "search",
    "sortField",
    "sortDirection",
    "page",
  ]) {
    const value = params[key];

    if (typeof value === "string" && value.trim().length > 0) {
      query.set(key, value.trim());
    }
  }

  query.set("pageSize", "50");

  const tenants = await apiRequestJson<TenantSummary[]>(
    `/super-admin/tenants?${query.toString()}`,
  );

  return (
    <main>
      <TenantListManager
        currentFilters={{
          status: typeof params.status === "string" ? params.status : undefined,
          subscriptionStatus:
            typeof params.subscriptionStatus === "string"
              ? params.subscriptionStatus
              : undefined,
          search: typeof params.search === "string" ? params.search : undefined,
          sortField:
            typeof params.sortField === "string" ? params.sortField : undefined,
          sortDirection:
            typeof params.sortDirection === "string"
              ? params.sortDirection
              : undefined,
          page: typeof params.page === "string" ? params.page : undefined,
        }}
        initialData={tenants}
      />
    </main>
  );
}