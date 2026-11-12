import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../_components/site-shell";
import { BankTransferPanel } from "./bank-transfer-panel";

export const metadata: Metadata = {
  title: "Pay by bank transfer",
  description:
    "Your DijiPeople invoice, payment reference and bank details. Your subscription starts after we verify your transfer.",
  // An order page is a capability URL: it must never be indexed or cached.
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ onboarding?: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The bank-transfer invoice page.
 *
 * It has no authority of its own: it renders whatever the API reports and
 * asserts nothing about payment. "I have paid" only queues the order for a
 * person at DijiPeople to verify the funds in the bank account.
 */
export default async function BankTransferPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { onboarding } = await searchParams;

  if (!onboarding || !UUID.test(onboarding)) {
    return (
      <PageShell>
        <section className="max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold text-foreground">
            Nothing to show here
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            This page reports on one specific order, and this link does not name
            one. Use the link in your invoice email.
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
      <BankTransferPanel onboardingId={onboarding} />
    </PageShell>
  );
}
