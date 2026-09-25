import {
  applicationsAwaitingReviewCount,
  metricValueOrUnavailable,
  partnerFunnelToRecord,
  relabelAgreementGroups,
  totalJobFailures,
} from "./operations-dashboard-metrics";

/**
 * TASK-0032 WP-07 / ITEM-0199 — the Operations dashboard's frontend-side pure
 * helpers. The point of pulling these out of `platform-dashboard.tsx` was so
 * the "no fabricated numbers" rule (a KPI whose section failed shows *why*,
 * not a zero) could be asserted directly rather than trusted by reading JSX.
 */

describe("metricValueOrUnavailable", () => {
  it("reports the real value and no reason when the section is available", () => {
    const result = metricValueOrUnavailable(
      { available: true, data: { count: 12 } },
      null,
      (data) => ({ value: data.count, description: "twelve things" }),
    );
    expect(result).toEqual({ value: 12, description: "twelve things", reason: null });
  });

  it("surfaces the section's own reason, not a zero, when the section failed", () => {
    const result = metricValueOrUnavailable<{ count: number }>(
      { available: false, reason: "connection reset" },
      null,
      (data) => ({ value: data.count, description: "twelve things" }),
    );
    expect(result.value).toBe("Not available");
    expect(result.reason).toBe("connection reset");
    expect(result.value).not.toBe(0);
  });

  it("falls back to the endpoint-level error when the section is entirely missing", () => {
    const result = metricValueOrUnavailable<{ count: number }>(
      undefined,
      "Request failed.",
      (data) => ({ value: data.count, description: "twelve things" }),
    );
    expect(result.reason).toBe("Request failed.");
  });

  it("gives its own generic reason when neither a section reason nor an endpoint error exists", () => {
    const result = metricValueOrUnavailable<{ count: number }>(
      undefined,
      null,
      (data) => ({ value: data.count, description: "twelve things" }),
    );
    expect(typeof result.reason).toBe("string");
    expect(result.reason).not.toBe("");
  });
});

describe("relabelAgreementGroups", () => {
  it("relabels every known lifecycle group", () => {
    expect(
      relabelAgreementGroups({
        draft: 3,
        awaitingSignature: 2,
        partiallySigned: 1,
        signedExecuted: 5,
        expired: 0,
        cancelledVoided: 1,
        other: 0,
      }),
    ).toEqual({
      Draft: 3,
      "Awaiting signature": 2,
      "Partially signed": 1,
      "Signed / executed": 5,
      Expired: 0,
      "Cancelled / voided": 1,
      // `other` dropped only because it is zero here.
    });
  });

  it("keeps a non-zero `other` bucket visible instead of hiding an unrecognised status", () => {
    const relabelled = relabelAgreementGroups({ other: 4 });
    expect(relabelled.Other).toBe(4);
  });
});

describe("partnerFunnelToRecord", () => {
  it("preserves funnel order as object insertion order", () => {
    const record = partnerFunnelToRecord([
      { label: "Inquiry", count: 40 },
      { label: "Application in review", count: 12 },
      { label: "Active", count: 5 },
    ]);
    expect(Object.keys(record)).toEqual([
      "Inquiry",
      "Application in review",
      "Active",
    ]);
    expect(record.Active).toBe(5);
  });
});

describe("applicationsAwaitingReviewCount", () => {
  it("reads exactly the `application` stage, not the whole funnel", () => {
    const count = applicationsAwaitingReviewCount([
      { key: "inquiry", count: 40 },
      { key: "application", count: 12 },
      { key: "active", count: 5 },
    ]);
    expect(count).toBe(12);
  });

  it("is zero, not undefined, when the funnel has no application stage", () => {
    expect(applicationsAwaitingReviewCount([{ key: "active", count: 5 }])).toBe(0);
  });
});

describe("totalJobFailures", () => {
  it("sums both failure sources", () => {
    expect(
      totalJobFailures({ outboxFailed: 3, platformEventsFailedLast24h: 2 }),
    ).toBe(5);
  });
});
