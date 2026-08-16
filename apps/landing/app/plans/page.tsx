import type { Metadata } from "next";
import { PlanCards } from "../_components/plan-cards";
import { PageShell } from "../_components/site-shell";
import { getCommercialConfig } from "../../lib/commercial-config";
import { resolveDisplayCurrency } from "../../lib/plans";
import { getPublicPlans } from "../../lib/plans-server";

export const metadata: Metadata = {
  title: "Plans and Pricing | DijiPeople",
  description:
    "Compare active DijiPeople plans and subscribe using admin-managed Stripe-ready pricing.",
};

export default async function PlansPage() {
  const [plansResponse, commercialConfig] = await Promise.all([
    getPublicPlans(),
    getCommercialConfig(),
  ]);
  const plans = plansResponse.plans;
  // The market's published currency, not a country guessed in this bundle.
  const defaultCurrency = resolveDisplayCurrency(
    plans,
    commercialConfig.currency,
  );

  return (
    <PageShell>
      <section className="max-w-3xl py-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Plans and pricing
        </p>
        <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
          Subscribe to the plan that matches your HR operating model.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          Prices are shown in your region’s currency. Pick the billing cycle
          that suits you — annual plans are billed once a year.
        </p>
      </section>
      <PlanCards
        defaultCurrency={defaultCurrency}
        error={plansResponse.error}
        plans={plans}
      />
    </PageShell>
  );
}
