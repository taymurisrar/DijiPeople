import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../_components/site-shell";

export const metadata: Metadata = {
  title: "Checkout cancelled",
  description:
    "Your DijiPeople checkout was cancelled and nothing was charged.",
};

type SearchParams = Promise<{ planPriceId?: string }>;

export default async function SubscribeCancelPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { planPriceId } = await searchParams;
  const retryHref = planPriceId
    ? `/subscribe?planPriceId=${planPriceId}`
    : "/subscribe";

  return (
    <PageShell>
      <section className="max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-warning">
          Checkout canceled
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          No subscription was activated.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          You can return to checkout or contact sales if you want help choosing
          the right plan and currency.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white" href={retryHref}>
            Retry checkout
          </Link>
          <Link className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground" href="/contact">
            Contact sales
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
