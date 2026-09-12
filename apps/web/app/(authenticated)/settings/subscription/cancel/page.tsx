import { ArrowLeft, XCircle } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { SettingsShell } from "../../_components/settings-shell";

export default function SubscriptionCheckoutCancelPage() {
  return (
    <SettingsShell
      title="Checkout cancelled"
      description="No subscription is activated when Stripe Checkout is cancelled."
    >
      <section className="rounded-[24px] border border-border bg-surface p-8 shadow-sm">
        <XCircle className="h-10 w-10 text-muted" aria-hidden="true" />
        <h2 className="mt-5 text-2xl font-semibold text-foreground">
          Checkout was cancelled
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          No payment confirmation was received and no subscription has been
          activated. You can return to subscription settings when ready.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {/*
            BUG-3345 — this button used the body-text fill class this record
            names, the sixth instance found and the second outside the file
            the record itself pointed to (the other five were in
            `billing-settings-client.tsx`).
          */}
          <Button
            href="/settings/subscription/plans"
            variant="primary"
            leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
          >
            Back to plans
          </Button>
        </div>
      </section>
    </SettingsShell>
  );
}
