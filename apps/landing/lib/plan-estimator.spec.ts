import { readFileSync } from "node:fs";
import { join } from "node:path";

import { estimateCost } from "./plan-presentation";

const experience = readFileSync(
  join(__dirname, "..", "app", "plans", "plans-experience.tsx"),
  "utf8",
);

const offer = (overrides: Record<string, unknown> = {}) =>
  ({
    available: true,
    billingModel: "PER_SEAT",
    unitAmount: 10,
    currency: "USD",
    minimumSeats: 1,
    maximumSeats: null,
    ...overrides,
  }) as Parameters<typeof estimateCost>[0];

/**
 * A headcount estimator shows the plans headcount affects.
 *
 * "Estimate your cost" listed every plan under an "Active employees" input,
 * including flat-priced ones whose figure never moved when the input changed,
 * and plans with no regional offer — which rendered as "On request" beside
 * three prices and read as a fourth quote rather than as an absence.
 *
 * The section had been correct once, when its copy claimed a per-seat
 * relationship `estimateCost` refused to compute. That contradiction was closed
 * by rewriting the *copy* to describe flat pricing, which left an estimator
 * whose control does nothing under a heading promising an estimate. Fixing the
 * sentence rather than the scope moved the inconsistency instead of removing it
 * — worth recording, because it is the cheaper fix every time.
 */
describe("the plan cost estimator", () => {
  describe("what it computes", () => {
    it("multiplies a per-seat price by headcount", () => {
      expect(estimateCost(offer(), 50)?.total).toBe(500);
    });

    it("bills the minimum commitment, and says it is doing so", () => {
      /*
       * The server bills `Math.max(quantity, minimumSeats)`. A page that quoted
       * six seats while Stripe charged ten is BUG-0080's shape exactly, so the
       * flag exists to let the page say "6 employees, billed at the 10-seat
       * minimum" rather than silently showing a number nobody typed.
       */
      const estimate = estimateCost(offer({ minimumSeats: 10 }), 6);
      expect(estimate?.total).toBe(100);
      expect(estimate?.belowMinimum).toBe(true);
    });

    it("flags a team above the self-service ceiling", () => {
      expect(
        estimateCost(offer({ maximumSeats: 100 }), 250)?.aboveMaximum,
      ).toBe(true);
    });

    it("returns nothing for an unavailable offer", () => {
      // Which is why such a plan must not reach the estimator at all: there is
      // no number to show, and "On request" beside real prices reads as a quote.
      expect(estimateCost(offer({ available: false }), 50)).toBeNull();
      expect(estimateCost(null, 50)).toBeNull();
    });
  });

  describe("what it lists", () => {
    it("filters to per-seat offers rather than mapping every plan", () => {
      /*
       * The load-bearing assertion. `plans.map` here is what put four immovable
       * figures under a control that moves them.
       */
      expect(experience).toContain("const perSeatPlans = useMemo(");
      expect(experience).toContain('entry.offer.billingModel === "PER_SEAT"');
      expect(experience).toContain("entry.offer?.available === true");
      expect(experience).toContain("perSeatPlans.map(");
    });

    it("renders no headcount control when nothing responds to it", () => {
      // An inert input teaches a visitor that the control does nothing, so a
      // genuine estimate later is not trusted either.
      expect(experience).toContain("perSeatPlans.length > 0 ? (");
    });

    it("says why the section is empty rather than showing an empty section", () => {
      const copy = experience.slice(
        experience.indexOf("Estimate your cost"),
        experience.indexOf("Team size presets"),
      );
      expect(copy).toContain("perSeatPlans.length > 0");
      expect(copy).toContain("billed per active employee");
      expect(copy).toContain("nothing to estimate");
    });
  });
});
