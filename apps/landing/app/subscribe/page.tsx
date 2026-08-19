import type { Metadata } from "next";
import { PageShell } from "../_components/site-shell";
import { getCommercialConfig } from "../../lib/commercial-config";
import { resolveDisplayCurrency } from "../../lib/plans";
import { getPublicPlans } from "../../lib/plans-server";
import { fetchPublishedLegalIndex } from "../../lib/legal-server";
import { landingEnv } from "../../lib/env";
import { SubscribeForm } from "./subscribe-form";

export const metadata: Metadata = {
  title: "Subscribe",
  description:
    "Start a public DijiPeople subscription through a secure Stripe Checkout flow.",
};

type SearchParams = Promise<{
  planPriceId?: string;
  plan?: string;
  billingInterval?: string;
  teamSize?: string;
}>;

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [selectionParams, plansResponse, commercialConfig, agreements] =
    await Promise.all([
      searchParams,
      getPublicPlans(),
      getCommercialConfig(),
      /*
       * Fetched server-side so the buyer never waits on a round trip mid-wizard,
       * and so a market with nothing published simply shows an agreements step
       * that says so. An empty index is a real answer here, not a failure.
       */
      fetchPublishedLegalIndex(),
    ]);
  const plans = plansResponse.plans;
  const defaultCurrency = resolveDisplayCurrency(
    plans,
    commercialConfig.currency,
  );

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
          Tell us about your company, then continue to secure payment. We start
          preparing your workspace as soon as your payment is confirmed.
        </p>
      </section>
      <SubscribeForm
        agreements={agreements}
        defaultCurrency={defaultCurrency}
        error={plansResponse.error}
        plans={plans}
        selectionParams={selectionParams}
        tenantBaseDomain={landingEnv.tenantBaseDomain}
      />
    </PageShell>
  );
}
