import { headers } from "next/headers";
import { getApiBaseUrl } from "./api";
import type { PublicPlan, PublicPlansResponse } from "./plans";

export async function getPublicPlans() {
  const response = await fetch(`${getApiBaseUrl()}/public/plans`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      plans: [],
      availableCurrencies: [],
      error: "Unable to load public plans from the DijiPeople API.",
    } satisfies PublicPlansResponse;
  }

  const payload = (await response.json()) as
    | PublicPlan[]
    | PublicPlansResponse;

  if (Array.isArray(payload)) {
    return {
      plans: payload,
      availableCurrencies: Array.from(
        new Set(
          payload.flatMap((plan) =>
            plan.prices.map((price) => price.currency.toUpperCase()),
          ),
        ),
      ).sort(),
    } satisfies PublicPlansResponse;
  }

  return payload;
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
