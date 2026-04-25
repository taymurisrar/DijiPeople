import { OnboardingListManager } from "@/app/_components/onboarding-list-manager";
import type {
  CustomerOnboardingRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
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

  for (const key of [
    "status",
    "subStatus",
    "customerId",
    "onboardingOwnerUserId",
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

  const [onboarding, lifecycleOptions, operators] = await Promise.all([
    apiRequestJson<PaginatedResponse<CustomerOnboardingRecord>>(
      `/super-admin/customer-onboarding?${query.toString()}`,
    ),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
  ]);

  return (
    <main>
      <OnboardingListManager
        currentFilters={{
          status: typeof params.status === "string" ? params.status : undefined,
          subStatus:
            typeof params.subStatus === "string" ? params.subStatus : undefined,
          customerId:
            typeof params.customerId === "string"
              ? params.customerId
              : undefined,
          onboardingOwnerUserId:
            typeof params.onboardingOwnerUserId === "string"
              ? params.onboardingOwnerUserId
              : undefined,
          search: typeof params.search === "string" ? params.search : undefined,
          sortField:
            typeof params.sortField === "string" ? params.sortField : undefined,
          sortDirection:
            typeof params.sortDirection === "string"
              ? params.sortDirection
              : undefined,
        }}
        initialData={onboarding}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
      />
    </main>
  );
}
