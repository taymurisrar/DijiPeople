"use client";

import { Button } from "@/app/components/ui/button";

/*
 * The two states that are neither "you may not" nor "there is nothing here".
 *
 * Kept distinct from `AccessDeniedState` on purpose. "You do not have
 * permission" is a question for the tenant's own administrator; "your plan does
 * not include this" is a question for DijiPeople. Rendering the same message
 * for both sends half the people who see it to the wrong place, and neither can
 * act on the other's answer.
 */

/**
 * The tenant's subscription does not include this capability.
 *
 * Deliberately names what is missing and points at Apps & Modules, which stays
 * reachable on every plan and is where the tenant can see which capabilities
 * the plan grants. A dead end that says only "unavailable" makes an upgrade
 * conversation impossible to start from inside the product.
 */
export function SettingsNotOnPlanState({
  capabilityLabel,
  scopeLabel,
}: {
  capabilityLabel: string;
  scopeLabel: string;
}) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Not included in your plan
      </p>

      <h3 className="mt-3 text-2xl font-semibold text-foreground">
        {scopeLabel} is not part of your current subscription.
      </h3>

      <p className="mt-3 max-w-3xl text-muted">
        These settings configure {capabilityLabel}, which your plan does not
        include. Any data your organization already has is kept and becomes
        available again if the capability is added to your plan.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {/*
          The subscription screen, which is core on every plan for exactly this
          reason: it is where a tenant sees what they are on and what an upgrade
          would add. A blocked page that offers no route to that is a dead end.
        */}
        <Button href="/settings/subscription" variant="secondary">
          View plan and pricing
        </Button>
        <Button href="/settings" variant="secondary">
          Back to settings
        </Button>
      </div>
    </section>
  );
}

/**
 * The plan could not be read, so nothing can be shown safely.
 *
 * This is the visible half of the fail-closed decision. The alternative — show
 * everything when the entitlement call fails — is what the sidebar did, and it
 * is how a Starter tenant was offered five unbought modules whenever the call
 * hiccuped (BUG-1952). Showing nothing without saying why would be worse still:
 * it reads as a downgrade nobody ordered. So the failure is stated.
 */
export function SettingsEntitlementsUnavailableState() {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Settings unavailable
      </p>

      <h3 className="mt-3 text-2xl font-semibold text-foreground">
        We could not confirm what your plan includes.
      </h3>

      <p className="mt-3 max-w-3xl text-muted">
        Settings are shown according to your subscription, and that information
        could not be loaded. Nothing is wrong with your account and no
        configuration has changed. Reload the page to try again.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {/*
         * A full navigation rather than a router refresh: the entitlement set is
         * fetched by the authenticated layout on the server, so only a fresh
         * document request re-runs it.
         */}
        <Button href="/settings" variant="secondary">
          Reload settings
        </Button>
      </div>
    </section>
  );
}
