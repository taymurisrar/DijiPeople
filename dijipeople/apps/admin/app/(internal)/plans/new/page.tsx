import Link from "next/link";
import { PlanForm } from "@/app/_components/plan-form";
import { apiRequestJson } from "@/lib/server-api";

type FeatureAvailability = {
  key: string;
  label: string;
  description: string;
}[];

export default async function NewPlanPage() {
  const featureCatalog = await apiRequestJson<FeatureAvailability>(
    "/super-admin/feature-catalog",
  ).catch(() => []);

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/plans"
          className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
        >
          Back to plans
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">Create plan</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Define a reusable SaaS plan and map product entitlements that tenant admins can activate within their workspace.
        </p>
      </section>

      <PlanForm
        mode="create"
        actionUrl="/api/super-admin/plans"
        featureCatalog={featureCatalog}
      />
    </main>
  );
}
