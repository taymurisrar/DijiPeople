import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { getApiBaseUrl } from "./api";
import type { PublicPlan, PublicPlansResponse } from "./plans";

/**
 * How the plans lookup actually ended.
 *
 * BUG-0061: this loader used to handle a non-2xx response gracefully and let a
 * transport failure throw, so `/` and `/subscribe` returned a 500 whenever the
 * API restarted, a deploy cycled, or a single request timed out. The sibling
 * loader `getCommercialConfig()` already caught the same failure and degraded.
 *
 * The four outcomes are kept distinct rather than collapsed into one "error"
 * string, because they call for different copy and different operational
 * responses. "We could not reach the service" is a temporary condition the
 * visitor should retry; "nothing is published for your region" is a permanent
 * one they should not. Flattening the two either tells people to retry
 * something that will never work, or hides an outage behind an empty state —
 * and hiding an outage is how a persistent backend failure goes unnoticed.
 */
export type PublicPlansStatus =
  | "OK"
  | "EMPTY"
  | "API_UNAVAILABLE"
  | "API_ERROR"
  | "MALFORMED";

export type PublicPlansResult = PublicPlansResponse & {
  status: PublicPlansStatus;
};

/**
 * A transport failure should degrade one section, never the page. The timeout
 * is explicit because a server component awaiting a hung fetch blocks the whole
 * render, and "slow forever" is a worse failure than "unavailable".
 */
const PLANS_FETCH_TIMEOUT_MS = 8000;

const MESSAGES: Record<Exclude<PublicPlansStatus, "OK" | "EMPTY">, string> = {
  API_UNAVAILABLE:
    "We could not reach our pricing service just now. Please try again in a moment.",
  API_ERROR: "Unable to load public plans from the DijiPeople API.",
  MALFORMED:
    "Our pricing service returned something we could not read. Please try again in a moment.",
};

function emptyResult(status: PublicPlansStatus): PublicPlansResult {
  return {
    plans: [],
    availableCurrencies: [],
    status,
    ...(status === "OK" || status === "EMPTY"
      ? {}
      : { error: MESSAGES[status] }),
  };
}

/** Currencies actually quoted by the returned plans. */
function currenciesOf(plans: PublicPlan[]): string[] {
  return Array.from(
    new Set(
      plans.flatMap((plan) =>
        (plan.prices ?? []).map((price) => price.currency.toUpperCase()),
      ),
    ),
  ).sort();
}

export async function getPublicPlans(): Promise<PublicPlansResult> {
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/public/plans`, {
      cache: "no-store",
      signal: AbortSignal.timeout(PLANS_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    /*
     * Next signals control flow through thrown errors — `DynamicServerError`,
     * redirect and notFound all arrive here looking like failures. Swallowing a
     * `DynamicServerError` tells the build this route rendered fine when it
     * actually opted into dynamic rendering, and logs a network outage that
     * never happened. Re-throw those first; only a genuine transport failure
     * falls through.
     */
    unstable_rethrow(error);

    // Connection refused, DNS failure, timeout, socket reset — the API is not
    // answering. Logged, because a silent empty state on the front door is how
    // an outage stays invisible until someone reports it from outside.
    console.error("[plans] Could not reach the plans API", error);
    return emptyResult("API_UNAVAILABLE");
  }

  if (!response.ok) {
    console.error(`[plans] Plans API responded ${response.status}`);
    return emptyResult("API_ERROR");
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[plans] Plans API returned unparseable JSON", error);
    return emptyResult("MALFORMED");
  }

  // The endpoint has historically returned both a bare array and an envelope.
  // Both are accepted; anything else is malformed rather than empty, so a
  // contract change surfaces as a distinct state instead of looking like a
  // region with no pricing.
  if (Array.isArray(payload)) {
    const plans = payload.filter(isPublicPlan);
    return {
      plans,
      availableCurrencies: currenciesOf(plans),
      status: plans.length > 0 ? "OK" : "EMPTY",
    };
  }

  if (payload && typeof payload === "object") {
    const envelope = payload as Partial<PublicPlansResponse>;

    if (!Array.isArray(envelope.plans)) {
      console.error(
        "[plans] Plans API envelope carried no plans array",
        Object.keys(envelope),
      );
      return emptyResult("MALFORMED");
    }

    const plans = envelope.plans.filter(isPublicPlan);
    return {
      plans,
      availableCurrencies: Array.isArray(envelope.availableCurrencies)
        ? envelope.availableCurrencies
        : currenciesOf(plans),
      status: plans.length > 0 ? "OK" : "EMPTY",
      ...(envelope.error ? { error: envelope.error } : {}),
    };
  }

  console.error("[plans] Plans API returned a non-object payload");
  return emptyResult("MALFORMED");
}

/**
 * Structural guard. A plan missing `id`/`key`/`prices` cannot be rendered or
 * bought, and dropping it is safer than letting a partial record reach a price
 * calculation.
 */
function isPublicPlan(value: unknown): value is PublicPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return (
    typeof plan.id === "string" &&
    typeof plan.key === "string" &&
    typeof plan.name === "string" &&
    Array.isArray(plan.prices)
  );
}

export async function getDetectedCountry() {
  const headerStore = await headers();
  return (
    headerStore.get("cf-ipcountry") ||
    headerStore.get("x-vercel-ip-country") ||
    headerStore.get("x-country-code") ||
    "US"
  ).toUpperCase();
}
