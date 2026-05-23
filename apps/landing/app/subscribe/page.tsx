import type { Metadata } from "next";
import { PageShell } from "../_components/site-shell";
import { resolveDefaultCurrency } from "../../lib/plans";
import { getDetectedCountry, getPublicPlans } from "../../lib/plans-server";
import { SubscribeForm } from "./subscribe-form";

export const metadata: Metadata = {
  title: "Subscribe | DijiPeople",
  description:
    "Start a public DijiPeople subscription through a secure Stripe Checkout flow.",
};

type SearchParams = Promise<{ planPriceId?: string }>;

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [{ planPriceId }, plansResponse, country] = await Promise.all([
    searchParams,
    getPublicPlans(),
    getDetectedCountry(),
  ]);
  const plans = plansResponse.plans;
  const defaultCurrency = resolveDefaultCurrency(plans, country);

  return (
    <PageShell>
      <section className="max-w-3xl py-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Subscribe
        </p>
        <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
          Create your workspace and continue to secure checkout.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          DijiPeople creates a pending workspace, links it to Stripe Checkout,
          and activates it only after payment is confirmed by webhook.
        </p>
      </section>
      <SubscribeForm
        availableCurrencies={plansResponse.availableCurrencies}
        defaultCurrency={defaultCurrency}
        error={plansResponse.error}
        initialPlanPriceId={planPriceId}
        plans={plans}
      />
    </PageShell>
  );
}
