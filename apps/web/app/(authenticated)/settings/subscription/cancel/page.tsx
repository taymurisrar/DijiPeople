import Link from "next/link";
import { ArrowLeft, XCircle } from "lucide-react";
import { SettingsShell } from "../../_components/settings-shell";

export default function SubscriptionCheckoutCancelPage() {
  return (
    <SettingsShell
      title="Checkout cancelled"
      description="No subscription is activated when Stripe Checkout is cancelled."
    >
      <section className="rounded-[24px] border border-border bg-surface p-8 shadow-sm">
        <XCircle className="h-10 w-10 text-muted" />
        <h2 className="mt-5 text-2xl font-semibold text-foreground">
          Checkout was cancelled
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          No payment confirmation was received and no subscription has been
          activated. You can return to subscription settings when ready.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/settings/subscription/plans"
            className="inline-flex items-center gap-2 rounded-[14px] bg-foreground px-4 py-3 text-sm font-semibold text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to plans
          </Link>
        </div>
      </section>
    </SettingsShell>
  );
}
