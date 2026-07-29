import { AccessDeniedState } from "../../../_components/access-denied-state";
import { getSessionUser } from "@/lib/auth";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { SettingsShell } from "../../_components/settings-shell";
import { BillingSettingsClient } from "../../billing/_components/billing-settings-client";
import { loadSubscriptionSettingsData } from "../_lib/load-subscription-settings";

type SubscriptionView = "overview" | "plans" | "billing-history";

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
  const canViewSubscription = hasElevatedTenantRole(user?.roleKeys);
  const copy = viewCopy[activeView];

  if (!canViewSubscription) {
    return (
      <SettingsShell title={copy.title} description={copy.description}>
        <AccessDeniedState
          title="Subscription access is restricted"
          description="Only Global Administrators and System Administrators can access subscription settings."
          actionHref="/settings"
          actionLabel="Back to settings"
        />
      </SettingsShell>
    );
  }

  const subscriptionData = await loadSubscriptionSettingsData();

  if (!subscriptionData.ok) {
    return (
      <SettingsShell title={copy.title} description={copy.description}>
        <AccessDeniedState
          title="Unable to load subscription"
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
        presentation={subscriptionData.presentation}
      />
    </SettingsShell>
  );
}
