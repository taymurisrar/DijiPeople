import { AccessDeniedState } from "../../../_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { hasSettingsPermission } from "../../_lib/require-settings-permission";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../_components/settings-shell";
import { BillingSettingsClient } from "../../billing/_components/billing-settings-client";
import {
  loadSubscriptionSettingsData,
  type SubscriptionView,
} from "../_lib/load-subscription-settings";
import { LoadFailureState } from "./load-failure-state";

const viewCopy: Record<
  SubscriptionView,
  { title: string; description: string }
> = {
  overview: {
    title: "Subscription",
    description:
      "Review current plan status, billing cycle, renewal details, Stripe status, and subscription actions.",
  },
  plans: {
    title: "Plans & Features",
    description:
      "Compare published plans and feature availability configured by the platform administrator.",
  },
  "billing-history": {
    title: "Billing History",
    description:
      "Review invoices, payments, refunds, and downloadable billing documents.",
  },
};

export async function SubscriptionSettingsPage({
  activeView,
}: {
  activeView: SubscriptionView;
}) {
  const user = await getSessionUser();
  /*
   * BUG-3336 — this used to gate on the elevated-role helper
   * (`hasElevatedTenantRole`, called with the user's role keys), which
   * `AGENTS.md` names specifically as a guard bypass and which does not match
   * what the API actually requires (`billing.view` +
   * `TENANT_ADMINISTRATION:read`). `hasSettingsPermission` is the same gate
   * every other settings screen in this app uses: an elevated settings admin
   * role, or the specific permission key. Full parity with the API's matrix
   * privilege would need an entity-key mirror in apps/web that does not exist
   * for any screen yet — this closes the gap the record measured (a user
   * holding `billing.view` but not an elevated role was refused by the UI
   * although the API would have served them) without inventing a new pattern.
   */
  const canViewSubscription = hasSettingsPermission(
    user,
    PERMISSION_KEYS.BILLING_VIEW,
  );
  const copy = viewCopy[activeView];

  if (!canViewSubscription) {
    return (
      <SettingsShell title={copy.title} description={copy.description}>
        <AccessDeniedState
          title="Subscription access is restricted"
          description="Only Global Administrators, System Administrators, and users holding the billing.view permission can access subscription settings."
          actionHref="/settings"
          actionLabel="Back to settings"
        />
      </SettingsShell>
    );
  }

  const subscriptionData = await loadSubscriptionSettingsData(activeView);

  if (!subscriptionData.ok) {
    return (
      <SettingsShell title={copy.title} description={copy.description}>
        {/*
          BUG-3336 — a failed load used to render `AccessDeniedState`, the
          same component shown for a genuine permissions refusal. This is a
          distinct, retryable state so a transient API failure does not read
          as "you are not allowed here".
        */}
        <LoadFailureState
          description={subscriptionData.message}
          traceId={subscriptionData.traceId}
          actionHref="/settings"
          actionLabel="Back to settings"
        />
      </SettingsShell>
    );
  }

  return (
    <SettingsShell title={copy.title} description={copy.description}>
      <BillingSettingsClient
        activeView={activeView}
        initialPlans={subscriptionData.plans}
        initialSubscription={subscriptionData.subscription}
        initialInvoices={subscriptionData.invoices}
        availableCurrencies={subscriptionData.availableCurrencies}
        presentation={subscriptionData.presentation}
      />
    </SettingsShell>
  );
}
