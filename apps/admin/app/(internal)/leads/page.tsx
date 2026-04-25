import { LeadListManager } from "@/app/_components/lead-list-manager";
import type {
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
  LeadRecord,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const key of [
    "status",
    "subStatus",
    "industry",
    "assignedToUserId",
    "source",
    "search",
    "sortField",
    "sortDirection",
    "page",
  ]) {
    const value = params[key];

    if (typeof value === "string" && value.length > 0) {
      query.set(key, value);
    }
  }

  query.set("pageSize", "50");

  const [leads, lifecycleOptions, operators] = await Promise.all([
    apiRequestJson<PaginatedResponse<LeadRecord>>(
      `/super-admin/leads?${query.toString()}`
    ),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
  ]);

  return (
    <main>
      <LeadListManager
        currentFilters={{
          status: typeof params.status === "string" ? params.status : undefined,
          subStatus:
            typeof params.subStatus === "string" ? params.subStatus : undefined,
          industry:
            typeof params.industry === "string" ? params.industry : undefined,
          assignedToUserId:
            typeof params.assignedToUserId === "string"
              ? params.assignedToUserId
              : undefined,
          source: typeof params.source === "string" ? params.source : undefined,
          search: typeof params.search === "string" ? params.search : undefined,
          sortField:
            typeof params.sortField === "string" ? params.sortField : undefined,
          sortDirection:
            typeof params.sortDirection === "string"
              ? params.sortDirection
              : undefined,
        }}
        initialData={leads}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
      />
    </main>
  );
}
