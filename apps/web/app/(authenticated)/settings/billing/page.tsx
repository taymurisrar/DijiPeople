import type { ComponentProps } from "react";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { apiRequestJson, isApiRequestError } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
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
  const canViewBilling = hasElevatedTenantRole(user?.roleKeys);

  if (!canViewBilling) {
    return (
      <SettingsShell
        title="Billing"
        description="Review subscription status, invoices, and plan options."
      >
        <AccessDeniedState
          title="Billing access is restricted"
          description="Only Global Administrators and System Administrators can access billing."
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
    const [plansResponse, subscription, invoicesResponse] = await Promise.all([
      apiRequestJson<unknown>("/billing/plans"),
      apiRequestJson<BillingSubscription>("/billing/subscription"),
      apiRequestJson<unknown>("/billing/invoices"),
    ]);

    const plans = readArrayPayload<BillingPlan>(plansResponse, "plans");
    const invoices = readArrayPayload<BillingInvoice>(
      invoicesResponse,
      "invoices",
    );

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

function readArrayPayload<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (payload && typeof payload === "object" && key in payload) {
    const nested = (payload as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested as T[];
  }

  throw new Error(`Billing ${key} response has an unexpected format.`);
}
