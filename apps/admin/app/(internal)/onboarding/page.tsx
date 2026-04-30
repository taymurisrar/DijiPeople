import { OnboardingListManager } from "@/app/_components/onboarding-list-manager";
import type {
  CustomerOnboardingRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type OnboardingFilters = {
  status?: string;
  subStatus?: string;
  customerId?: string;
  onboardingOwnerUserId?: string;
  search?: string;
  sortField?: string;
  sortDirection?: string;
  page?: string;
};

const DEFAULT_PAGE_SIZE = 50;

function getSearchParam(
  params: Record<string, string | string[] | undefined>,
  key: keyof OnboardingFilters,
) {
  const value = params[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function normalizeFilters(
  params: Record<string, string | string[] | undefined>,
): OnboardingFilters {
  return {
    status: getSearchParam(params, "status"),
    subStatus: getSearchParam(params, "subStatus"),
    customerId: getSearchParam(params, "customerId"),
    onboardingOwnerUserId: getSearchParam(params, "onboardingOwnerUserId"),
    search: getSearchParam(params, "search"),
    sortField: getSearchParam(params, "sortField"),
    sortDirection: getSearchParam(params, "sortDirection"),
    page: getSearchParam(params, "page"),
  };
}

function buildQueryString(filters: OnboardingFilters) {
  const query = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  query.set("pageSize", String(DEFAULT_PAGE_SIZE));

  return query.toString();
}

async function safeApiRequest<T>(url: string): Promise<T | null> {
  try {
    return await apiRequestJson<T>(url);
  } catch (error) {
    console.error(`[OnboardingPage] Failed to fetch ${url}`, error);
    return null;
  }
}

function OnboardingPageErrorState() {
  return (
    <main className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
      <div className="max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-500">
          Data unavailable
        </p>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Customer onboarding could not be loaded
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          The onboarding workspace is temporarily unavailable. Please refresh
          the page or try again after the platform services are restored.
        </p>
      </div>
    </main>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const filters = normalizeFilters(params);
  const queryString = buildQueryString(filters);

  const [onboarding, lifecycleOptions, operators] = await Promise.all([
    safeApiRequest<PaginatedResponse<CustomerOnboardingRecord>>(
      `/super-admin/customer-onboarding?${queryString}`,
    ),
    safeApiRequest<LifecycleOptions>("/super-admin/lifecycle-options"),
    safeApiRequest<OperatorOption[]>("/super-admin/operators"),
  ]);

  if (!onboarding || !lifecycleOptions || !operators) {
    return <OnboardingPageErrorState />;
  }

  return (
    <main className="flex flex-col gap-6">
      <OnboardingListManager
        currentFilters={filters}
        initialData={onboarding}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
      />
    </main>
  );
}