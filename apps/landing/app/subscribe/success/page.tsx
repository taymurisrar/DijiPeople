import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../_components/site-shell";
import { ProvisioningProgress } from "./provisioning-progress";

export const metadata: Metadata = {
  title: "Setting up your workspace",
  description:
    "Your DijiPeople subscription is confirmed and your workspace is being prepared.",
};

type SearchParams = Promise<{ session_id?: string; onboarding?: string }>;

/**
 * Where Stripe returns the buyer.
 *
 * This page used to be static — "Thanks. Stripe is confirming your
 * subscription." and a link home. It said nothing about whether anything had
 * actually happened, which is the one thing somebody who has just paid wants to
 * know.
 *
 * **The page has no authority of its own.** Arriving here does not mean payment
 * succeeded: a browser redirect is not the provider's word, and provisioning is
 * authorised by the verified webhook and nothing else. So it asserts nothing and
 * renders whatever the status endpoint reports — including "awaiting payment"
 * if the webhook has not landed yet.
 */
export default async function SubscribeSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { onboarding } = await searchParams;

  /*
   * No onboarding id means somebody reached this URL without going through
   * checkout — a bookmark, a shared link, a stripped query string. There is
   * nothing to report, and inventing reassurance would be the same lie the
   * static page told.
   */
  if (!onboarding) {
    return (
      <PageShell>
        <section className="max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold text-foreground">
            Nothing to show here
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This page reports on one specific order, and this link does not name
            one. If you have just paid, use the link in your confirmation email.
          </p>
          <Link
            className="mt-5 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white"
            href="/plans"
          >
            Back to plans
          </Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ProvisioningProgress onboardingId={onboarding} />
    </PageShell>
  );
}
