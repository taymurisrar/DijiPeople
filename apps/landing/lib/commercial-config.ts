import { headers } from "next/headers";

import { landingEnv } from "./env";

/**
 * Published commercial configuration, resolved server-side.
 *
 * The landing site does not decide which market a visitor is in, which currency
 * they see, or whether a plan can be bought online. It asks the API, which
 * resolves all three from published configuration Platform Admin governs.
 *
 * Resolving here rather than in the browser is deliberate: a client-side
 * currency decision shows one price and then corrects it, and the flicker is
 * the visible symptom of the price being decided in the wrong place.
 */

export type CommercialOfferView =
  | {
      available: true;
      billingInterval: "MONTH" | "YEAR";
      currency: string;
      unitAmount: number;
      billingModel: "PER_SEAT" | "FLAT";
      minimumSeats: number;
      maximumSeats: number | null;
      includedSeats: number;
      selfServiceEligible: boolean;
      priceVersion: number;
    }
  | {
      available: false;
      billingInterval: "MONTH" | "YEAR";
      reason: string;
      message: string;
    };

export type CommercialPlanView = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  salesModel: "SELF_SERVICE" | "SALES_ASSISTED" | "CUSTOM_ONLY";
  metadata: Record<string, unknown> | null;
  features: string[];
  offers: CommercialOfferView[];
};

/**
 * A feature as the product defines it, not as marketing describes it.
 *
 * Comes from the same catalogue the product gates modules on, so the public page
 * cannot advertise a capability that does not exist, and a feature whose
 * entitlement changes changes here too.
 */
export type CommercialFeatureView = {
  key: string;
  label: string;
  description: string;
  categoryKey: string;
  categoryLabel: string;
  categoryOrder: number;
  sortOrder: number;
  icon: string | null;
};

export type CommercialConfigView = {
  market: {
    code: string;
    name: string;
    selfServiceEnabled: boolean;
    launchStatus: string;
  } | null;
  currency: string | null;
  billingIntervals: Array<"MONTH" | "YEAR">;
  plans: CommercialPlanView[];
  featureCatalog: CommercialFeatureView[];
};

const EMPTY_CONFIG: CommercialConfigView = {
  market: null,
  currency: null,
  billingIntervals: [],
  plans: [],
  featureCatalog: [],
};

/**
 * Country headers set by the edge/CDN. Forwarded rather than re-derived,
 * because the platform in front of this app is the only thing that actually
 * knows where the request came from — and a header the browser can set is not
 * evidence of anything.
 */
const COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-country-code",
] as const;

export async function getCommercialConfig(): Promise<CommercialConfigView> {
  const requestHeaders = await headers();

  const forwarded: Record<string, string> = {};
  for (const header of COUNTRY_HEADERS) {
    const value = requestHeaders.get(header);
    if (value) forwarded[header] = value;
  }

  try {
    const response = await fetch(
      `${landingEnv.apiBaseUrl}/public/commercial-config`,
      {
        headers: { Accept: "application/json", ...forwarded },
        // Matches the API's own cache window. Published commercial
        // configuration changes rarely, and every render reads it.
        next: { revalidate: 60 },
      },
    );

    if (!response.ok) return EMPTY_CONFIG;

    const payload = (await response.json()) as CommercialConfigView;
    return payload ?? EMPTY_CONFIG;
  } catch {
    // A pricing page that renders nothing is recoverable; one that renders a
    // guessed price is not. Fail to an empty catalogue and let the caller show
    // a commercial state rather than a number nobody published.
    return EMPTY_CONFIG;
  }
}

export function findOffer(
  plan: CommercialPlanView,
  billingInterval: "MONTH" | "YEAR",
) {
  return plan.offers.find((offer) => offer.billingInterval === billingInterval) ?? null;
}

/** Whether a plan can be bought online right now, per published configuration. */
export function isSelfServiceAvailable(
  plan: CommercialPlanView,
  billingInterval: "MONTH" | "YEAR",
) {
  const offer = findOffer(plan, billingInterval);
  return Boolean(offer?.available && offer.selfServiceEligible);
}
