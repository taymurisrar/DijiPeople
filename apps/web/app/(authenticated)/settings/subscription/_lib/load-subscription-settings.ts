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

export type SubscriptionView = "overview" | "plans" | "billing-history";

export async function loadSubscriptionSettingsData(activeView: SubscriptionView) {
  try {
    // BUG-3336 — `/billing/invoices` was fetched on every view, including
    // Plans and Overview, neither of which reads it.
    const [plansResponse, subscription, invoicesResponse] = await Promise.all([
      apiRequestJson<unknown>("/billing/plans"),
      apiRequestJson<BillingSubscription>("/billing/subscription"),
      activeView === "billing-history"
        ? apiRequestJson<unknown>("/billing/invoices")
        : Promise.resolve<unknown>({ invoices: [] as BillingInvoice[] }),
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
    // Optional and read defensively (unlike `plans`/`invoices`, which throw
    // on a malformed shape): older or test payloads may not carry this field,
    // and its absence should degrade to the client's own derivation
    // (BUG-3333) rather than fail the whole page load.
    const availableCurrencies = readOptionalArrayPayload<string>(
      plansResponse,
      "availableCurrencies",
    );

    return {
      ok: true as const,
      plans,
      subscription,
      invoices,
      presentation,
      availableCurrencies,
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

function readOptionalArrayPayload<T>(payload: unknown, key: string): T[] {
  if (payload && typeof payload === "object" && key in payload) {
    const nested = (payload as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested as T[];
  }

  return [];
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
