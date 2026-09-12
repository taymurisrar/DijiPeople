/*
 * BUG-3330 — the Plans screen quoted a per-seat price as the whole monthly
 * charge and never told the buyer what a seat count actually billed.
 *
 * This mirrors `resolveBillableSeats` / `calculateSeatPricing` from
 * `services/api/src/modules/billing/billing-seat-pricing.ts` closely enough
 * that the total this screen shows cannot silently drift from what Stripe is
 * asked to charge — that rule was implemented twice on the server already and
 * the two copies disagreed (see the comment above `resolveBillableSeats`
 * there), which is exactly the failure mode duplicating it client-side risks
 * repeating a third time.
 *
 * TODO(BUG-3330): replace this mirror with a call to a server-side seat quote
 * endpoint once the billing API exposes one (`calculateSeatPricing` is
 * already written and unit-tested server-side; only the HTTP surface is
 * missing). Until then, any change to the server rule must be copied here by
 * hand — flagged so the API stream picks this up rather than the two rules
 * quietly drifting apart again.
 */

export type SeatPriceLike = {
  billingModel?: "PER_SEAT" | "FLAT";
  minimumSeats?: number;
  maximumSeats?: number | null;
  includedSeats?: number;
};

/** How many units of `unitAmount` a seat count actually bills. */
export function resolveBillableSeatsClient(
  price: SeatPriceLike,
  seats: number,
): number {
  if (price.billingModel !== "PER_SEAT") return 1;
  const included = price.includedSeats ?? 0;
  return Math.max(0, seats - included);
}

export type SeatCountValidation =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Refuses an out-of-bounds seat count rather than clamping it — the previous
 * checkout call silently clamped to `minimumSeats`/`maximumSeats`, so a buyer
 * who typed a number the price could not honour was charged for a different
 * number than the one they entered, with no indication that had happened.
 */
export function validateSeatCount(
  price: SeatPriceLike,
  seats: number,
): SeatCountValidation {
  const minimum = price.minimumSeats ?? 1;
  const maximum = price.maximumSeats ?? null;

  if (!Number.isInteger(seats) || seats < minimum) {
    return {
      ok: false,
      message: `Seat quantity must be at least ${minimum}.`,
    };
  }

  if (maximum !== null && seats > maximum) {
    return {
      ok: false,
      message: `Seat quantity cannot exceed ${maximum}.`,
    };
  }

  return { ok: true };
}

export function estimateSeatOrder(
  price: SeatPriceLike & { unitAmount: number },
  seats: number,
) {
  const billableSeats = resolveBillableSeatsClient(price, seats);

  return {
    billableSeats,
    estimatedTotal: price.unitAmount * billableSeats,
  };
}
