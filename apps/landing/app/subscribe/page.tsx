import type { Metadata } from "next";
import { PageShell } from "../_components/site-shell";
import {
  getCommercialConfig,
  publishedBillingModels,
} from "../../lib/commercial-config";
import { resolveDisplayCurrency } from "../../lib/plans";
import { getPublicPlans } from "../../lib/plans-server";
import { fetchPublishedLegalIndex } from "../../lib/legal-server";
import { landingEnv } from "../../lib/env";
import { Eyebrow, PageHeading } from "../_components/marketing/typography";
import { SubscribeForm } from "./subscribe-form";

export const metadata: Metadata = {
  title: "Get started",
  // "Start a public DijiPeople subscription through a secure Stripe Checkout
  // flow" described our integration, not the visitor's next five minutes.
  description:
    "Set up your DijiPeople workspace and pay securely. We start preparing it as soon as your payment goes through.",
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
        <Eyebrow>Get started</Eyebrow>
        <PageHeading className="mt-3">Set up your workspace.</PageHeading>
        <p className="mt-4 text-base leading-7 text-muted">
          A few details about your company, then secure payment. We start
          setting up your workspace as soon as the payment goes through, and
          email you when it&rsquo;s ready.
        </p>
      </section>
      {/*
        The published billing model travels with the plans, so the wizard
        resolves the same price /plans advertises rather than whichever one
        /public/plans happens to list first — BUG-1369.
      */}
      <SubscribeForm
        agreements={agreements}
        defaultCurrency={defaultCurrency}
        error={plansResponse.error}
        plans={plans}
        publishedBillingModels={publishedBillingModels(commercialConfig)}
        selectionParams={selectionParams}
        tenantBaseDomain={landingEnv.tenantBaseDomain}
      />
    </PageShell>
  );
}
