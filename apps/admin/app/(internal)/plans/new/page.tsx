import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  CircleDollarSign,
  Layers3,
  ShieldCheck,
} from "lucide-react";
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
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="p-6 lg:p-8">
          <Link
            href="/plans"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to plans
          </Link>

          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                New billing package
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Create plan
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Define a reusable SaaS plan with pricing, billing-cycle
                structure, sort order, availability, and module entitlements
                that can later be assigned to tenant subscriptions.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Feature catalog
              </p>

              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {featureCatalog.length}
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Available entitlement keys can be mapped into this plan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
            <CircleDollarSign className="h-5 w-5" />
          </div>

          <h2 className="mt-4 text-base font-semibold text-slate-950">
            Pricing
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Set monthly and annual base pricing so billing can calculate tenant
            subscription values consistently.
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <h2 className="mt-4 text-base font-semibold text-slate-950">
            Entitlements
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Select the product modules and feature keys that tenants receive
            when subscribed to this plan.
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
            <Boxes className="h-5 w-5" />
          </div>

          <h2 className="mt-4 text-base font-semibold text-slate-950">
            Availability
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Control whether this plan is active and where it appears in the
            commercial package order.
          </p>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
            <Layers3 className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Plan configuration
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Complete the commercial and entitlement setup below. You can edit
              pricing and feature mapping later if the package changes.
            </p>
          </div>
        </div>

        <PlanForm
          mode="create"
          actionUrl="/api/super-admin/plans"
          featureCatalog={featureCatalog}
        />
      </section>
    </main>
  );
}