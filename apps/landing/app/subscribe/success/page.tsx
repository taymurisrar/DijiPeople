import Link from "next/link";
import { PageShell } from "../../_components/site-shell";

export default function SubscribeSuccessPage() {
  return (
    <PageShell>
      <section className="max-w-2xl rounded-[28px] border border-border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Checkout submitted
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Thanks. Stripe is confirming your subscription.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your workspace is activated only after the Stripe webhook confirms
          payment. The DijiPeople team can see the lead, tenant, checkout, and
          billing activity in admin logs.
        </p>
        <Link className="mt-5 inline-flex rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white" href="/">
          Back to home
        </Link>
      </section>
    </PageShell>
  );
}
