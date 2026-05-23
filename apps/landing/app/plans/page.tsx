import type { Metadata } from "next";
import { PlanCards } from "../_components/plan-cards";
import { PageShell } from "../_components/site-shell";
import { resolveDefaultCurrency } from "../../lib/plans";
import { getDetectedCountry, getPublicPlans } from "../../lib/plans-server";

export const metadata: Metadata = {
  title: "Plans and Pricing | DijiPeople",
  description:
    "Compare active DijiPeople plans and subscribe using admin-managed Stripe-ready pricing.",
};

export default async function PlansPage() {
  const plansResponse = await getPublicPlans();
  const plans = plansResponse.plans;
  const country = await getDetectedCountry();
  const defaultCurrency = resolveDefaultCurrency(plans, country);

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
          Pricing, billing cycle, currency, and checkout availability come from
          active PlanPrice records managed in the DijiPeople admin portal.
        </p>
      </section>
      <PlanCards
        availableCurrencies={plansResponse.availableCurrencies}
        defaultCurrency={defaultCurrency}
        error={plansResponse.error}
        plans={plans}
      />
    </PageShell>
  );
}
