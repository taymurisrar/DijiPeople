import Link from "next/link";
import { OnboardingDetailManager } from "@/app/_components/onboarding-detail-manager";
import type {
  CustomerOnboardingRecord,
  LifecycleOptions,
  OperatorOption,
  PlanOption,
} from "@/app/_components/platform-lifecycle-types";
import { apiRequestJson } from "@/lib/server-api";

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ onboardingId: string }>;
}) {
  const { onboardingId } = await params;
  const [onboarding, lifecycleOptions, operators, plans] = await Promise.all([
    apiRequestJson<CustomerOnboardingRecord>(`/super-admin/customer-onboarding/${onboardingId}`),
    apiRequestJson<LifecycleOptions>("/super-admin/lifecycle-options"),
    apiRequestJson<OperatorOption[]>("/super-admin/operators"),
    apiRequestJson<PlanOption[]>("/super-admin/plans"),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/onboarding" className="text-sm font-medium text-slate-600 hover:text-slate-950">
          Back to onboarding
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Onboarding detail
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          {onboarding.customer.companyName}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {onboarding.status.replaceAll("_", " ")} • {onboarding.subStatus ?? "No sub-status"}
        </p>
      </section>

      <OnboardingDetailManager
        onboarding={onboarding}
        lifecycleOptions={lifecycleOptions}
        operators={operators}
        plans={plans}
      />
    </main>
  );
}
