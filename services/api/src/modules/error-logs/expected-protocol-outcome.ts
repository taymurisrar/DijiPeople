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

/**
 * 401 codes that mean "not signed in", rather than "something went wrong".
 *
 * `SESSION_REVOKED` joined this list on 2026-08-30 (BUG-2465). Leaving it out
 * was not a small omission: a revoked session is what a *deliberate* sign-out
 * produces, so it is if anything more routine than an expired one, and the
 * clients that poll on a timer keep asking after it. 41 rows and roughly 1,510
 * occurrences sat in the triage queue because of the one missing entry —
 * against 48 occurrences for `SESSION_EXPIRED`, which was recognised. When two
 * codes describe the same event to the user ("sign in again"), they belong on
 * the same side of this line.
 */
const SESSION_AUTH_CODES = new Set([
  'AUTH_TOKEN_MISSING',
  'AUTH_TOKEN_INVALID',
  'AUTH_REFRESH_TOKEN_INVALID',
  'AUTH_UNAUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
]);

/**
 * Public host-resolution paths, where a `404` is the answer and not a failure.
 *
 * `GET /public/tenants/resolve?host=…` exists to answer "is this hostname a
 * tenant workspace?". "No" is a correct answer, and it is the answer for every
 * marketing host, every expired preview deployment and every mistyped domain —
 * 39 rows and 124 occurrences of it in the production queue, for hosts like
 * `www.dijipeople.com`.
 *
 * Matched on the path rather than on `TENANT_NOT_FOUND` alone, because that
 * same code on an authenticated route would mean something quite different:
 * a tenant that should exist and does not.
 */
const HOST_RESOLUTION_PATHS = ['/public/tenants/resolve'];

/**
 * `400` codes that are a business rule answering about *data*, not a request
 * the client got wrong.
 *
 * This does not reopen the 400 question above. Rows are excluded one named
 * code at a time, and only where the code itself proves the request was
 * well-formed and the refusal was the feature working:
 *
 * - `CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE` — the chosen record lacks a field
 *   the template requires (most often a customer with no authorized signer on
 *   file). The refusal names each missing field and the operator fixes the
 *   record or enters the signer; nothing is broken. A generic class-validator
 *   400 still reaches the queue as before, because it never carries this code.
 * - The support-case lifecycle refusals (WS11) — a status change the
 *   transition table forbids, one missing its required information, or an
 *   edit to a closed or merged case. Each is the state machine doing its job
 *   on a well-formed request. The referential refusals (tenant/customer not
 *   found or mismatched) are deliberately NOT listed: those can point at a
 *   stale UI or a real data problem and stay visible.
 */
const EXPECTED_DOMAIN_REFUSAL_CODES = new Set([
  'CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE',
  'SUPPORT_CASE_TRANSITION_NOT_ALLOWED',
  'SUPPORT_CASE_TRANSITION_REQUIRES_INFO',
  'SUPPORT_CASE_CLOSURE_CONFIRMATION_REQUIRED',
  'SUPPORT_CASE_LOCKED',
  'SUPPORT_CASE_MERGED_READ_ONLY',
  'SUPPORT_CASE_ESCALATION_LIMIT',
  'SUPPORT_CASE_RELATION_EXISTS',
  // An active agreement already exists for the counterparty. The refusal names
  // the existing agreement and the way forward (amendment/renewal); it is the
  // duplicate guard working, on a well-formed request (409).
  'CONTRACT_DUPLICATE_AGREEMENT',
]);

/**
 * Messages that are the feature telling a person what to fix, matched only on
 * the exact paths that produce them. Each pattern is anchored on both the path
 * and the wording, so an unrelated 400 on the same route, or the same wording
 * elsewhere, still queues.
 */
const USER_CORRECTABLE_MESSAGES: Array<{ path: RegExp; message: RegExp }> = [
  // A signer opening a link that was already used or has lapsed. The page
  // tells them; nothing is broken.
  {
    path: /\/public\/signatures\//,
    message:
      /^(This signature link has already been completed|Signature link has expired)\.$/,
  },
  // Choosing a password that fails the published policy.
  {
    path: /\/auth\/(activate-account|reset-password|change-password)$/,
    message: /^Password must /,
  },
  // Required agreement fields still blank at submit/send time.
  {
    path: /\/contracts\/[^/]+\/(submit-approval|signature-requests)$/,
    message:
      /^(Resolve required document fields before signature:|[A-Z][A-Za-z ]+ is required\.)/,
  },
];

/**
 * Format constraints on text a person typed. Every segment of the message must
 * be one of these for the 400 to count as user-correctable: a single segment
 * outside the list (a UUID, an enum, "should not exist") keeps the whole row in
 * the queue, because those mean our own client sent something it should not.
 */
const TYPED_TEXT_CONSTRAINT =
  /^(?:[A-Za-z0-9_.]+ must be an email|[A-Za-z0-9_.]+ must be (?:longer|shorter) than or equal to \d+ characters|[A-Za-z0-9_.]+ should not be empty)$/;

function isTypedTextValidation(message: string): boolean {
  const segments = message.split(', ').map((part) => part.trim());
  return (
    segments.length > 0 && segments.every((s) => TYPED_TEXT_CONSTRAINT.test(s))
  );
}

export type ProtocolOutcomeInput = {
  statusCode?: number | null;
  errorCode?: string | null;
  /** True when the request matched no route at all. */
  unmatchedRoute?: boolean;
  /** Request path, used to recognise routes whose 404 is a legitimate answer. */
  path?: string | null;
  /** Recorded message, used only for the narrow user-correctable rules. */
  message?: string | null;
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

  // A host that is not a tenant. The endpoint's whole job is to answer that
  // question, and "no" is one of the two answers it is allowed to give.
  if (status === 404 && code === 'TENANT_NOT_FOUND' && isHostResolution(input))
    return true;

  // A record that cannot fill the template chosen for it. Recorded, not
  // queued: the operator was told exactly which fields to supply.
  if (
    (status === 400 || status === 409) &&
    EXPECTED_DOMAIN_REFUSAL_CODES.has(code)
  )
    return true;

  // A stale or probed price id on the anonymous checkout surface.
  if (
    status === 404 &&
    code === 'BILLING_PLAN_PRICE_UNAVAILABLE' &&
    (input.path ?? '').split('?')[0].includes('/public/')
  )
    return true;

  if (status === 400) {
    const message = input.message ?? '';
    const path = (input.path ?? '').split('?')[0];
    if (
      USER_CORRECTABLE_MESSAGES.some(
        (rule) => rule.path.test(path) && rule.message.test(message),
      )
    )
      return true;
    // Typed-text format failures (an email, a length) on a *named* user-facing
    // route only; the same text on any other route could be our own client.
    if (
      code === 'VALIDATION_FAILED' &&
      USER_TYPED_TEXT_PATHS.some((rx) => rx.test(path)) &&
      isTypedTextValidation(message)
    )
      return true;
  }

  return false;
}

const USER_TYPED_TEXT_PATHS = [
  /\/contracts\/[^/]+\/parties(\/[^/]+)?$/,
  /\/contracts\/[^/]+\/signature-requests$/,
  /\/auth\/(login|admin\/login|forgot-password|activate-account)$/,
  /\/admin\/auth\/login$/,
];

function isHostResolution(input: ProtocolOutcomeInput): boolean {
  const path = input.path ?? '';
  if (!path) return false;
  // `path` carries the query string on the recorded value, so compare on the
  // prefix rather than for equality.
  const withoutQuery = path.split('?')[0];
  return HOST_RESOLUTION_PATHS.some(
    (candidate) =>
      withoutQuery === candidate || withoutQuery.endsWith(`/api${candidate}`),
  );
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
