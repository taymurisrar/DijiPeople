import { OnboardingCreateManager } from "@/app/_components/onboarding-create-manager";
import type {
  CustomerRecord,
  LifecycleOptions,
  OperatorOption,
  PaginatedResponse,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

export default async function NewOnboardingPage() {
  const [lifecycleOptions, operators, customersResponse, plans] =
    await Promise.all([
      apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
      apiRequestJson<OperatorOption[]>("/super-admin/operators"),
      apiRequestJson<PaginatedResponse<CustomerRecord>>(
        "/super-admin/customers?pageSize=100",
      ),
      apiRequestJson<PlanOption[]>("/super-admin/plans"),
    ]);

  return (
    <main className="space-y-4">
      <OnboardingCreateManager
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        customers={customersResponse.items}
        plans={plans}
      />
    </main>
  );
}