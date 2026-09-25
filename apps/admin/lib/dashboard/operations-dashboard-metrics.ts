/**
 * Pure helpers behind the platform Operations dashboard view (TASK-0032
 * WP-07 / ITEM-0199).
 *
 * Kept framework-free — no React, no icons, no routing — so they can be unit
 * tested the way `apps/admin` already tests logic (`jest.config.js` runs
 * `*.spec.ts` under Node, with no jsdom). `platform-dashboard.tsx` wraps
 * these with the icon/href/tone a `Metric` needs; the *decision* of what a
 * KPI shows when its data source failed lives here, once, rather than
 * duplicated per metric in the component.
 */

export type OperationsSectionLike<T> =
  | { available: true; data: T }
  | { available: false; reason: string };

export type MetricValue = {
  value: number | string;
  description: string;
  /** Non-null exactly when the section was unavailable — the reason to show, and the signal to render the KPI in its "attention" tone. */
  reason: string | null;
};

/**
 * A KPI whose section resolved reports the real figure. A KPI whose section
 * didn't reports "Not available" and why — never a `0` standing in for data
 * that was never fetched (AGENTS.md "No fabricated numbers").
 */
export function metricValueOrUnavailable<T>(
  section: OperationsSectionLike<T> | undefined,
  opsError: string | null,
  pick: (data: T) => { value: number | string; description: string },
): MetricValue {
  if (section?.available) {
    const { value, description } = pick(section.data);
    return { value, description, reason: null };
  }
  const reason =
    section && !section.available
      ? section.reason
      : (opsError ?? "The operations dashboard endpoint did not respond.");
  return { value: "Not available", description: reason, reason };
}

const AGREEMENT_GROUP_LABELS: Record<string, string> = {
  draft: "Draft",
  awaitingSignature: "Awaiting signature",
  partiallySigned: "Partially signed",
  signedExecuted: "Signed / executed",
  expired: "Expired",
  cancelledVoided: "Cancelled / voided",
  other: "Other",
};

/**
 * Turns the API's camelCase agreement lifecycle groups into the labels
 * `BreakdownChart` displays, and drops a zero-count `other` bucket — a
 * status this repo adds later and the backend doesn't recognise yet should
 * be visible as "Other: 3", not silently present as "Other: 0" forever.
 */
export function relabelAgreementGroups(
  groups: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(groups)) {
    if (key === "other" && value === 0) continue;
    out[AGREEMENT_GROUP_LABELS[key] ?? key] = value;
  }
  return out;
}

/**
 * The partner funnel as `BreakdownChart` needs it: a label-keyed record in
 * the *funnel's* order, not sorted by count. `BreakdownChart` is told to
 * skip its usual biggest-first sort (`ordered: true`) for exactly this
 * reason — a funnel that reorders itself when a middle stage briefly holds
 * more records than an earlier one stops reading as a funnel.
 */
export function partnerFunnelToRecord(
  funnel: Array<{ label: string; count: number }>,
): Record<string, number> {
  return Object.fromEntries(funnel.map((stage) => [stage.label, stage.count]));
}

/** The one funnel stage the "applications awaiting review" KPI and alert both mean. */
export function applicationsAwaitingReviewCount(
  funnel: Array<{ key: string; count: number }>,
): number {
  return funnel.find((stage) => stage.key === "application")?.count ?? 0;
}

/** Background job failures, summed across the two sources that can report one (outbox dispatch, platform event delivery). */
export function totalJobFailures(jobFailures: {
  outboxFailed: number;
  platformEventsFailedLast24h: number;
}): number {
  return jobFailures.outboxFailed + jobFailures.platformEventsFailedLast24h;
}
