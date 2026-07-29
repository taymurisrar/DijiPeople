import type { ComponentProps } from "react";
import { isApiRequestError, apiRequestJson } from "@/lib/server-api";
import { BillingSettingsClient } from "../../billing/_components/billing-settings-client";

type BillingPlan = ComponentProps<
  typeof BillingSettingsClient
>["initialPlans"][number];
type BillingSubscription = ComponentProps<
  typeof BillingSettingsClient
>["initialSubscription"];
type BillingInvoice = ComponentProps<
  typeof BillingSettingsClient
>["initialInvoices"][number];
type BillingPresentation = ComponentProps<
  typeof BillingSettingsClient
>["presentation"];

export async function loadSubscriptionSettingsData() {
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
    const presentation = readObjectPayload<BillingPresentation>(
      plansResponse,
      "presentation",
    );

    return {
      ok: true as const,
      plans,
      subscription,
      invoices,
      presentation,
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Subscription information could not be loaded.",
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

  throw new Error(`Subscription ${key} response has an unexpected format.`);
}

function readObjectPayload<T>(payload: unknown, key: string): T | undefined {
  if (payload && typeof payload === "object" && key in payload) {
    const nested = (payload as Record<string, unknown>)[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as T;
    }
  }

  return undefined;
}
