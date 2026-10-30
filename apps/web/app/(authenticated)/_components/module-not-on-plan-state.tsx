"use client";

import { Button } from "@/app/components/ui/button";

/**
 * Shown in place of a module the tenant's plan does not include.
 *
 * The Settings equivalent speaks of "these settings"; a module route is not a
 * settings page, so this names the module instead. Same destination for the
 * upgrade conversation: the subscription screen is core on every plan.
 */
export function ModuleNotOnPlanState({ moduleLabel }: { moduleLabel: string }) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Not included in your plan
      </p>

      <h2 className="mt-3 text-2xl font-semibold text-foreground">
        {moduleLabel} is not part of your current subscription.
      </h2>

      <p className="mt-3 max-w-3xl text-muted">
        Your plan does not include {moduleLabel}. Any data your organization
        already has is kept and becomes available again if it is added to your
        plan.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button href="/settings/subscription" variant="secondary">
          View plan and pricing
        </Button>
        <Button href="/" variant="secondary">
          Back to overview
        </Button>
      </div>
    </section>
  );
}
