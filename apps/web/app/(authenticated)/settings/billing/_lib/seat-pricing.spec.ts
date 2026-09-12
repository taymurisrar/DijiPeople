import {
  estimateSeatOrder,
  resolveBillableSeatsClient,
  validateSeatCount,
} from "./seat-pricing";

/*
 * BUG-3330 regression coverage — the client-side mirror of
 * `resolveBillableSeats` / `calculateSeatPricing` must agree with the
 * server's rule (services/api/src/modules/billing/billing-seat-pricing.ts),
 * whose own spec is `billing-seat-pricing.spec.ts`. The fixture values here
 * are taken from that file so both suites are asserting the same rule.
 */
describe("resolveBillableSeatsClient", () => {
  it("bills every purchased seat for a PER_SEAT price", () => {
    expect(
      resolveBillableSeatsClient(
        { billingModel: "PER_SEAT", includedSeats: 0 },
        25,
      ),
    ).toBe(25);
  });

  it("nets out included seats for a PER_SEAT price", () => {
    expect(
      resolveBillableSeatsClient(
        { billingModel: "PER_SEAT", includedSeats: 18 },
        25,
      ),
    ).toBe(7);
  });

  it("never bills a negative seat count", () => {
    expect(
      resolveBillableSeatsClient(
        { billingModel: "PER_SEAT", includedSeats: 30 },
        25,
      ),
    ).toBe(0);
  });

  it("always bills exactly one unit for a FLAT price, regardless of seats", () => {
    expect(
      resolveBillableSeatsClient({ billingModel: "FLAT", includedSeats: 25 }, 10),
    ).toBe(1);
    expect(
      resolveBillableSeatsClient({ billingModel: "FLAT", includedSeats: 25 }, 30),
    ).toBe(1);
  });
});

describe("estimateSeatOrder", () => {
  it("quotes a per-seat total that equals unitAmount x billableSeats", () => {
    const price = {
      billingModel: "PER_SEAT" as const,
      includedSeats: 0,
      unitAmount: 300,
    };

    expect(estimateSeatOrder(price, 25)).toEqual({
      billableSeats: 25,
      estimatedTotal: 7500,
    });
  });

  it("quotes the flat fee once, not multiplied by seats", () => {
    const price = {
      billingModel: "FLAT" as const,
      includedSeats: 25,
      unitAmount: 12000,
    };

    expect(estimateSeatOrder(price, 25)).toEqual({
      billableSeats: 1,
      estimatedTotal: 12000,
    });
  });
});

describe("validateSeatCount", () => {
  const price = { minimumSeats: 5, maximumSeats: 100 };

  it("refuses a count below the minimum and states the bound", () => {
    expect(validateSeatCount(price, 4)).toEqual({
      ok: false,
      message: "Seat quantity must be at least 5.",
    });
  });

  it("refuses a count above the maximum and states the bound", () => {
    expect(validateSeatCount(price, 101)).toEqual({
      ok: false,
      message: "Seat quantity cannot exceed 100.",
    });
  });

  it("accepts a count inside the bounds", () => {
    expect(validateSeatCount(price, 50)).toEqual({ ok: true });
  });

  it("treats an unbounded maximum as no ceiling", () => {
    expect(validateSeatCount({ minimumSeats: 1, maximumSeats: null }, 100000)).toEqual({
      ok: true,
    });
  });
});
