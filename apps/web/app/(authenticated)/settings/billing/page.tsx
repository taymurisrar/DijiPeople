import type { ComponentProps } from "react";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { apiRequestJson, isApiRequestError } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { hasAnySettingsPermission } from "../_lib/require-settings-permission";
import { SettingsShell } from "../_components/settings-shell";
import { BillingSettingsClient } from "./_components/billing-settings-client";

type BillingPlan = ComponentProps<
  typeof BillingSettingsClient
>["initialPlans"][number];
type BillingSubscription = ComponentProps<
  typeof BillingSettingsClient
>["initialSubscription"];
type BillingInvoice = ComponentProps<
  typeof BillingSettingsClient
>["initialInvoices"][number];

export default async function BillingSettingsPage() {
  const user = await getSessionUser();
  const canViewBilling = hasAnySettingsPermission(user, [
    PERMISSION_KEYS.BILLING_VIEW,
    PERMISSION_KEYS.SETTINGS_READ,
  ]);

  if (!canViewBilling) {
    return (
      <SettingsShell
        title="Billing"
        description="Review subscription status, invoices, and plan options."
      >
        <AccessDeniedState
          title="Billing access is restricted"
          description="Your current role does not include billing.view or settings administration access."
          actionHref="/settings"
          actionLabel="Back to settings"
        />
      </SettingsShell>
    );
  }

  const billingData = await loadBillingData();

  if (billingData.ok) {
    return (
      <SettingsShell
        title="Billing"
        description="Manage tenant subscription status, online plan selection, Stripe billing actions, and invoice history."
      >
        <BillingSettingsClient
          initialPlans={billingData.plans}
          initialSubscription={billingData.subscription}
          initialInvoices={billingData.invoices}
        />
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Billing"
      description="Manage tenant subscription status, online plan selection, Stripe billing actions, and invoice history."
    >
      <AccessDeniedState
        title="Unable to load billing"
        description={billingData.message}
        traceId={billingData.traceId}
        actionHref="/settings"
        actionLabel="Back to settings"
      />
    </SettingsShell>
  );
}

async function loadBillingData() {
  try {
    const [plans, subscription, invoices] = await Promise.all([
      apiRequestJson<BillingPlan[]>("/billing/plans"),
      apiRequestJson<BillingSubscription>("/billing/subscription"),
      apiRequestJson<BillingInvoice[]>("/billing/invoices"),
    ]);

    return {
      ok: true as const,
      plans,
      subscription,
      invoices,
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Billing information could not be loaded.",
      traceId: isApiRequestError(error) ? error.traceId : null,
    };
  }
}
