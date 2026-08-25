import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

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

const COMMERCIAL_CONFIG_TIMEOUT_MS = 8000;

export async function getCommercialConfig(): Promise<CommercialConfigView> {
  const requestHeaders = await headers();

  const forwarded: Record<string, string> = {};

  for (const header of COUNTRY_HEADERS) {
    const value = requestHeaders.get(header);

    if (value) {
      forwarded[header] = value;
    }
  }

  try {
    const response = await fetch(
      `${landingEnv.apiBaseUrl}/public/commercial-config`,
      {
        headers: {
          Accept: "application/json",
          ...forwarded,
        },
        next: {
          revalidate: 60,
        },
        // A server component awaiting a hung fetch blocks the whole render, so
        // "slow forever" degrades worse than "unavailable" (BUG-0061).
        signal: AbortSignal.timeout(COMMERCIAL_CONFIG_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      return EMPTY_CONFIG;
    }

    const raw: unknown = await response.json();

    return normalizeCommercialConfig(raw);
  } catch (error) {
    // Same reasoning as plans-server: Next's control-flow errors must not be
    // absorbed by a network catch.
    unstable_rethrow(error);

    console.error(
      "[commercial-config] Failed to resolve commercial configuration",
      error,
    );

    return EMPTY_CONFIG;
  }
}
function normalizeCommercialConfig(
  raw: unknown,
): CommercialConfigView {
  if (!raw || typeof raw !== "object") {
    console.error(
      "[commercial-config] Invalid commercial config payload",
      raw,
    );

    return EMPTY_CONFIG;
  }

  const payload = raw as Record<string, unknown>;

  const rawMarket = payload.market;

  const market =
    rawMarket && typeof rawMarket === "object"
      ? {
        code: stringValue(
          (rawMarket as Record<string, unknown>).code,
        ),
        name: stringValue(
          (rawMarket as Record<string, unknown>).name,
        ),
        selfServiceEnabled: Boolean(
          (rawMarket as Record<string, unknown>)
            .selfServiceEnabled,
        ),
        launchStatus: stringValue(
          (rawMarket as Record<string, unknown>)
            .launchStatus,
        ),
      }
      : null;

  const plans = Array.isArray(payload.plans)
    ? payload.plans
    : [];

  const featureCatalog = normalizeFeatureCatalog(
    payload.featureCatalog,
  );

  const billingIntervals = Array.isArray(
    payload.billingIntervals,
  )
    ? payload.billingIntervals.filter(
      (
        value,
      ): value is "MONTH" | "YEAR" =>
        value === "MONTH" || value === "YEAR",
    )
    : [];

  const currency =
    typeof payload.currency === "string"
      ? payload.currency
      : null;

  return {
    market,
    currency,
    billingIntervals,
    plans: plans as CommercialPlanView[],
    featureCatalog,
  };
}

function normalizeFeatureCatalog(
  raw: unknown,
): CommercialFeatureView[] {
  if (Array.isArray(raw)) {
    return raw.filter(isCommercialFeature);
  }

  /*
   * Compatibility with APIs that return the catalogue wrapped
   * inside an object rather than directly as an array.
   */
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;

    const possibleArrays = [
      record.features,
      record.items,
      record.data,
      record.featureCatalog,
    ];

    for (const candidate of possibleArrays) {
      if (Array.isArray(candidate)) {
        console.warn(
          "[commercial-config] featureCatalog was wrapped; normalizing response shape",
        );

        return candidate.filter(isCommercialFeature);
      }
    }
  }

  console.error(
    "[commercial-config] Expected featureCatalog to be an array",
    raw,
  );

  return [];
}
function isCommercialFeature(
  value: unknown,
): value is CommercialFeatureView {
  if (!value || typeof value !== "object") {
    return false;
  }

  const feature = value as Record<string, unknown>;

  return (
    typeof feature.key === "string" &&
    typeof feature.label === "string" &&
    typeof feature.description === "string" &&
    typeof feature.categoryKey === "string" &&
    typeof feature.categoryLabel === "string" &&
    typeof feature.categoryOrder === "number" &&
    typeof feature.sortOrder === "number" &&
    (typeof feature.icon === "string" ||
      feature.icon === null)
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function findOffer(
  plan: CommercialPlanView,
  billingInterval: "MONTH" | "YEAR",
) {
  return plan.offers.find((offer) => offer.billingInterval === billingInterval) ?? null;
}

/**
 * Which billing model the market publishes, per plan and interval.
 *
 * Keyed `"<planKey>:<MONTH|YEAR>"` so it survives being handed to a client
 * component. The subscribe wizard needs the *published* model to resolve the
 * same price `/plans` shows — see `findPlanPrice` and BUG-1369, where the two
 * disagreed by about 25% because the wizard matched on currency and cycle alone
 * and took whichever price the API happened to list first.
 *
 * Built from the offers rather than from a rule about billing models, on
 * purpose. This config is the publisher: it exposes exactly one offer per
 * interval, and which one is a commercial decision Platform Admin governs.
 * Re-deriving it in the frontend — "prefer per-seat", say — would put that
 * decision back in the one place that cannot see the configuration, which is
 * what BUG-0027 and BUG-0028 were.
 *
 * An unavailable offer contributes nothing: it names no model, and a plan
 * missing from the map falls back to the wizard's older behaviour.
 */
export function publishedBillingModels(
  config: CommercialConfigView,
): Record<string, "PER_SEAT" | "FLAT"> {
  const models: Record<string, "PER_SEAT" | "FLAT"> = {};

  for (const plan of config.plans ?? []) {
    for (const offer of plan.offers ?? []) {
      if (!offer.available) continue;
      models[`${plan.key}:${offer.billingInterval}`] = offer.billingModel;
    }
  }

  return models;
}

/** Whether a plan can be bought online right now, per published configuration. */
export function isSelfServiceAvailable(
  plan: CommercialPlanView,
  billingInterval: "MONTH" | "YEAR",
) {
  const offer = findOffer(plan, billingInterval);
  return Boolean(offer?.available && offer.selfServiceEligible);
}
