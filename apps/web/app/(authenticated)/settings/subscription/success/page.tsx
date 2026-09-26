import Link from "next/link";
import { CheckCircle2, RefreshCcw } from "lucide-react";
import { SettingsShell } from "../../_components/settings-shell";
import { PaymentStatusPanel } from "../_components/payment-status-panel";

export default async function SubscriptionCheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A checkout DijiPeople priced itself returns with its payment id, and the
  // page shows what the API says about that payment — not what the redirect
  // implies. A Stripe checkout returns with a session id instead and keeps
  // the page below.
  const { payment } = await searchParams;
  if (typeof payment === "string" && payment) {
    return (
      <SettingsShell title="Payment" description="The status of your payment.">
        <PaymentStatusPanel paymentId={payment} returnedFrom="success" />
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Checkout received"
      description="Stripe has received the checkout result. DijiPeople will activate or update the subscription only after webhook confirmation."
    >
      <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-8 shadow-sm">
        <CheckCircle2 className="h-10 w-10 text-emerald-700" />
        <h2 className="mt-5 text-2xl font-semibold text-emerald-950">
          Payment confirmation is processing
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-800">
          Stripe accepted the checkout flow, but the subscription is not marked
          active from this page. DijiPeople waits for verified Stripe webhook
          events before changing paid subscription status.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/settings/subscription/overview"
            className="inline-flex items-center gap-2 rounded-[14px] bg-emerald-900 px-4 py-3 text-sm font-semibold text-white"
          >
            <RefreshCcw className="h-4 w-4" />
            Check subscription status
          </Link>
        </div>
      </section>
    </SettingsShell>
  );
}
