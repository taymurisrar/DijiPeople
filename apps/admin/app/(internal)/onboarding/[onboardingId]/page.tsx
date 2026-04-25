import { notFound } from "next/navigation";
import { OnboardingDetailManager } from "@/app/_components/onboarding-detail-manager";
import type {
  CustomerOnboardingRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ onboardingId: string }>;
}) {
  const { onboardingId } = await params;

  if (!isUuid(onboardingId)) {
    notFound();
  }

  const [onboarding, lifecycleOptions, operators, plans] = await Promise.all([
    apiRequestJson<CustomerOnboardingRecord>(
      `/super-admin/customer-onboarding/${onboardingId}`
    ),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-4">
      <OnboardingDetailManager
        onboarding={onboarding}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}