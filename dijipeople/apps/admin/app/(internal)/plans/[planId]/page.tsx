import Link from "next/link";
import { PlanForm } from "@/app/_components/plan-form";
import { apiRequestJson } from "@/lib/server-api";

type PlanRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  monthlyBasePrice: number;
  annualBasePrice: number;
  currency: string;
  sortOrder: number;
  subscriptionCount: number;
  features: string[];
};

type FeatureAvailability = {
  key: string;
  label: string;
  description: string;
}[];

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const [plan, featureCatalog] = await Promise.all([
    apiRequestJson<PlanRecord>(`/super-admin/plans/${planId}`),
    apiRequestJson<FeatureAvailability>("/super-admin/feature-catalog").catch(() => []),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/plans"
          className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
        >
          Back to plans
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Plan detail
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">{plan.name}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {plan.description ?? "No description provided yet."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {plan.currency} {plan.monthlyBasePrice.toFixed(2)} / month •{" "}
            {plan.subscriptionCount} subscription{plan.subscriptionCount === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      <PlanForm
        mode="edit"
        actionUrl={`/api/super-admin/plans/${plan.id}`}
        initialPlan={plan}
        featureCatalog={featureCatalog}
      />
    </main>
  );
}
