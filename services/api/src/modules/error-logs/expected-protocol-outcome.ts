/**
 * Which recorded failures are not incidents.
 *
 * The monitoring queue held 1,588 rows waiting for triage and the newest pages
 * of it were almost entirely non-incidents: `401` responses from ordinary
 * session expiry and `404` responses for routes that do not exist. Neither is
 * something a human should pick up, and together they buried the genuine signal
 * — including eleven critical items nobody had touched (BUG-1754).
 *
 * These are still *recorded*. They are useful to support when a customer asks
 * why they were signed out, and dropping them would trade one blind spot for
 * another. What changes is that they are not queued: they arrive as
 * `NOT_AN_INCIDENT` rather than `NEW`.
 *
 * ## Why 400 is deliberately not in this list
 *
 * The record proposing this fix also suggested excluding "client validation
 * rejections that carry no server fault". That is the tempting one and it is
 * the dangerous one. BUG-1742 — no lead could be created from Platform Admin
 * for anyone, in production — presented as exactly that: a `400` from
 * class-validator saying `partnerId must be a UUID`. A rule that filed it as
 * routine client error would have hidden a defect that blocked the entry point
 * of the commercial funnel.
 *
 * The distinction that matters is not "did the client send something invalid"
 * but "could the client have sent something valid". A `401` on an expired
 * session and a `404` on a path that does not exist are both answers the
 * protocol is *for*. A `400` means something asked for something impossible,
 * and often the thing that asked was our own frontend.
 */

/** 401 codes that mean "not signed in", rather than "something went wrong". */
const SESSION_AUTH_CODES = new Set([
  'AUTH_TOKEN_MISSING',
  'AUTH_TOKEN_INVALID',
  'AUTH_REFRESH_TOKEN_INVALID',
  'AUTH_UNAUTHORIZED',
  'SESSION_EXPIRED',
]);

export type ProtocolOutcomeInput = {
  statusCode?: number | null;
  errorCode?: string | null;
  /** True when the request matched no route at all. */
  unmatchedRoute?: boolean;
};

/**
 * Whether this failure is an expected protocol outcome rather than an incident.
 *
 * Deliberately narrow. Anything not recognised here keeps its place in the
 * queue: a rule that guesses wrong in this direction hides defects, and the
 * cost of guessing wrong in the other is one extra row a human dismisses.
 */
export function isExpectedProtocolOutcome(
  input: ProtocolOutcomeInput,
): boolean {
  const status = input.statusCode ?? 0;
  const code = input.errorCode ?? '';

  // An expired or absent session. Every one of these tells the user to sign in
  // again, which is the system working.
  if (status === 401 && SESSION_AUTH_CODES.has(code)) return true;

  // A request for a route that does not exist. Not a broken feature — usually a
  // scanner, a stale bookmark or a probe.
  if (status === 404 && input.unmatchedRoute) return true;

  return false;
}

/**
 * The support status a newly recorded failure should start in.
 *
 * `NEW` means "a human needs to look at this". Expected outcomes never did, and
 * defaulting them to `NEW` is what filled the queue.
 */
export const NOT_AN_INCIDENT = 'NOT_AN_INCIDENT';

export function initialSupportStatus(input: ProtocolOutcomeInput): string {
  return isExpectedProtocolOutcome(input) ? NOT_AN_INCIDENT : 'NEW';
}
