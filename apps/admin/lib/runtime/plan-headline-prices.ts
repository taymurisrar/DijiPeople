/**
 * The one monthly/annual pair a plan's headline tiles may show.
 *
 * A plan does not have "a" monthly price and "an" annual price. Starter alone
 * carries twelve active `PlanPrice` rows: three currencies (PKR, QAR, USD) x
 * two billing models (per-seat, flat) x two cycles. The tiles used to pick
 * each cycle independently —
 *
 *     prices.find((p) => p.billingCycle === "MONTHLY" && p.isActive !== false)
 *     prices.find((p) => p.billingCycle === "ANNUAL"  && p.isActive !== false)
 *
 * — with no constraint tying the two rows together. The repository orders
 * prices by `currency asc, billingCycle asc`, and within one currency and
 * cycle the per-seat and flat rows tie, so the two lookups landed on different
 * schedules: monthly resolved to the PKR per-seat row (300) and annual to the
 * PKR **flat** row (120,000). That is BUG-1954. The rendered "PKR 120,000.00"
 * was a real stored price; it was simply not the price beside it, and no
 * minor-unit conversion was involved — `unitAmount` is `Decimal(12,2)` in
 * major units all the way from Prisma to `Intl.NumberFormat`.
 *
 * The caption compounded it. 300 x 12 = 3,600 is less than 120,000, so the
 * saving clamped to zero and the tile asserted "No annual discount against
 * monthly billing" for a schedule whose annual price is deliberately ten
 * months of the monthly one.
 *
 * So the pair is chosen as a pair: one currency, one billing model, both
 * cycles. Preference order, and why:
 *
 *  1. A schedule that carries **both** cycles, because the discount caption is
 *     only meaningful when the two figures beside it are comparable.
 *  2. **Per-seat before flat.** Per-seat is the public schedule that
 *     self-service checkout sells; flat rows are sales-assisted and a visitor
 *     cannot reach them (see `pricing.catalog.ts`).
 *  3. First appearance, which follows the API's `currency asc` ordering and so
 *     matches the currency `mapPlan` already publishes as `startingCurrency`.
 *
 * `otherScheduleCount` is returned so the tiles can say that what they show is
 * one schedule of several. A single headline figure for a twelve-price plan is
 * lossy no matter which row it picks; the fix for that is to say which row it
 * is, not to pick a different one silently.
 */

export type PlanPriceLike = {
  billingCycle?: string | null;
  billingModel?: string | null;
  currency?: string | null;
  unitAmount?: number | null;
  isActive?: boolean | null;
};

export type PlanHeadlinePrices = {
  /** ISO code the two amounts are denominated in; null when nothing is priced. */
  currency: string | null;
  /** `PER_SEAT` / `FLAT` as stored, or null when nothing is priced. */
  billingModel: string | null;
  monthly: number | null;
  annual: number | null;
  /** Annual saving against twelve monthly payments, in `currency`. Never negative. */
  annualSaving: number;
  annualSavingPercent: number;
  /** How many other (currency, billing model) schedules this plan also carries. */
  otherScheduleCount: number;
};

const EMPTY: PlanHeadlinePrices = {
  currency: null,
  billingModel: null,
  monthly: null,
  annual: null,
  annualSaving: 0,
  annualSavingPercent: 0,
  otherScheduleCount: 0,
};

type Schedule = {
  currency: string;
  billingModel: string;
  monthly: number | null;
  annual: number | null;
  order: number;
};

export function selectPlanHeadlinePrices(prices: unknown): PlanHeadlinePrices {
  if (!Array.isArray(prices)) return EMPTY;

  const schedules = new Map<string, Schedule>();

  for (const entry of prices) {
    if (!entry || typeof entry !== "object") continue;
    const price = entry as PlanPriceLike;
    // Absent means active: the runtime record payload and the legacy plan
    // payload both send the flag, but a partially-populated form value may not.
    if (price.isActive === false) continue;

    const amount = price.unitAmount;
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue;

    const currency =
      typeof price.currency === "string" && price.currency.trim().length
        ? price.currency.trim().toUpperCase()
        : null;
    if (!currency) continue;

    const cycle =
      typeof price.billingCycle === "string"
        ? price.billingCycle.toUpperCase()
        : "";
    if (cycle !== "MONTHLY" && cycle !== "ANNUAL") continue;

    const billingModel =
      typeof price.billingModel === "string" && price.billingModel.trim().length
        ? price.billingModel.trim().toUpperCase()
        : "UNSPECIFIED";

    const key = `${currency}|${billingModel}`;
    const schedule = schedules.get(key) ?? {
      currency,
      billingModel,
      monthly: null,
      annual: null,
      order: schedules.size,
    };
    /*
     * Lowest wins where a schedule somehow carries two rows for one cycle.
     * Duplicate active prices for the same plan, cycle and currency are a known
     * production condition — `getPlanPriceDuplicateRisks` exists to report them
     * — and an arbitrary winner would make the tile flicker between deploys.
     * Lowest is the same convention as `mapPlan`'s `monthlyFrom`/`annualFrom`.
     */
    if (cycle === "MONTHLY") {
      schedule.monthly =
        schedule.monthly === null ? amount : Math.min(schedule.monthly, amount);
    } else {
      schedule.annual =
        schedule.annual === null ? amount : Math.min(schedule.annual, amount);
    }
    schedules.set(key, schedule);
  }

  if (!schedules.size) return EMPTY;

  const ranked = [...schedules.values()].sort(compareSchedules);
  const chosen = ranked[0];
  if (!chosen) return EMPTY;

  const monthlyAnnualized = chosen.monthly === null ? 0 : chosen.monthly * 12;
  const annualSaving =
    chosen.annual !== null && monthlyAnnualized > 0
      ? Math.max(monthlyAnnualized - chosen.annual, 0)
      : 0;

  return {
    currency: chosen.currency,
    billingModel:
      chosen.billingModel === "UNSPECIFIED" ? null : chosen.billingModel,
    monthly: chosen.monthly,
    annual: chosen.annual,
    annualSaving,
    annualSavingPercent:
      monthlyAnnualized > 0
        ? Math.round((annualSaving / monthlyAnnualized) * 100)
        : 0,
    otherScheduleCount: ranked.length - 1,
  };
}

function compareSchedules(a: Schedule, b: Schedule): number {
  const aComplete = a.monthly !== null && a.annual !== null;
  const bComplete = b.monthly !== null && b.annual !== null;
  if (aComplete !== bComplete) return aComplete ? -1 : 1;

  const aSeat = a.billingModel === "PER_SEAT";
  const bSeat = b.billingModel === "PER_SEAT";
  if (aSeat !== bSeat) return aSeat ? -1 : 1;

  return a.order - b.order;
}

/** "Per seat, PKR" — how the tiles name the schedule they are showing. */
export function describePlanSchedule(headline: PlanHeadlinePrices): string {
  if (!headline.currency) return "";
  const model =
    headline.billingModel === "PER_SEAT"
      ? "Per seat"
      : headline.billingModel === "FLAT"
        ? "Flat"
        : null;
  return model ? `${model}, ${headline.currency}` : headline.currency;
}
