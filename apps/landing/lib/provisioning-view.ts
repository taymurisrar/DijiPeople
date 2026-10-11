/**
 * What the post-payment page is allowed to say.
 *
 * The rendering lives in a client component; the *decisions* live here, because
 * they are the ones that can lie. The brief's rule is that no step may be shown
 * as complete unless a row evidences it, and the failure mode is not a rendering
 * bug — it is a plausible-looking optimism that nobody notices until a customer
 * clicks "Open DijiPeople" and lands on a hostname that does not resolve.
 *
 * So every question the page asks about state is answered by a pure function
 * with a test behind it, and the component only paints the answer.
 */

export type OnboardingProgressState =
  | "AWAITING_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "PROVISIONING"
  | "READY"
  | "ACTION_REQUIRED"
  | "EXPIRED";

export type OnboardingStepView = {
  key: string;
  label: string;
  state: "DONE" | "PENDING";
};

export type OnboardingWorkspaceView = {
  name: string;
  hostname: string;
  url: string;
};

export type OnboardingStatusView = {
  orderNumber: string;
  state: OnboardingProgressState;
  steps: OnboardingStepView[];
  workspace: OnboardingWorkspaceView | null;
  actionRequired: string | null;
};

/**
 * Whether polling should stop.
 *
 * `READY` and `ACTION_REQUIRED` are the only states nothing will move on its
 * own. `EXPIRED` deliberately is not terminal for polling purposes — an expired
 * *checkout session* still becomes `PAYMENT_CONFIRMED` if the buyer completes a
 * second attempt, and a page that stopped listening would never show it.
 */
export function isTerminalState(state: OnboardingProgressState) {
  return state === "READY" || state === "ACTION_REQUIRED";
}

/**
 * Whether the workspace can actually be opened.
 *
 * Two conditions, both required. `READY` alone is not enough: the API returns a
 * workspace only once a primary domain exists, and a "ready" state with no
 * domain is precisely the case where a button would 404.
 */
export function canOpenWorkspace(
  status: OnboardingStatusView | null,
): status is OnboardingStatusView & { workspace: OnboardingWorkspaceView } {
  return Boolean(status && status.state === "READY" && status.workspace);
}

/**
 * The headline, in the customer's terms rather than the system's.
 *
 * `AWAITING_PAYMENT` is worth its own line. Reaching this page means Stripe
 * redirected the browser back, but the redirect is not the provider's word —
 * only the provider's own answer, read by the server, is — so until that
 * lands the honest statement is that confirmation is still coming, not that it
 * has arrived.
 *
 * `PAYMENT_CONFIRMED` and `PROVISIONING` each get their own line too. They
 * used to share the generic "preparing" headline, so the moment the payment
 * was confirmed — the one the buyer was anxious about — changed nothing on
 * screen but a small tick in the list.
 */
export function headlineFor(status: OnboardingStatusView | null) {
  if (!status) return "We're preparing your DijiPeople workspace.";

  switch (status.state) {
    case "READY":
      return canOpenWorkspace(status)
        ? "Your workspace is ready."
        : "We're finishing the last step.";
    case "ACTION_REQUIRED":
      return "We need to look at something.";
    case "AWAITING_PAYMENT":
      return "We're confirming your payment.";
    case "PAYMENT_CONFIRMED":
      return "Payment received. We're creating your workspace.";
    case "PROVISIONING":
      return "We're setting up your workspace.";
    case "EXPIRED":
      return "This checkout session expired.";
    default:
      return "We're preparing your DijiPeople workspace.";
  }
}

/**
 * What to say when the page stops polling without a workspace.
 *
 * The old sentence — "your payment is safe and your workspace is still being
 * prepared" — was said whatever the state, including when the payment had
 * never been confirmed. To a buyer still at `AWAITING_PAYMENT` that is a claim
 * nobody had evidence for, and it told them to close the page and wait for an
 * email that might not come. So the two cases are told apart, and the
 * unconfirmed one names the action: do not pay again, check again, or contact
 * us with the order number.
 */
export function timedOutMessage(status: OnboardingStatusView | null) {
  const order = status?.orderNumber ? ` quoting order ${status.orderNumber}` : "";
  if (!status || status.state === "AWAITING_PAYMENT" || status.state === "EXPIRED") {
    return `We have not received confirmation of this payment yet. If you were charged, please do not pay again — check again in a few minutes, or contact us${order} and we will sort it out.`;
  }
  return `This is taking longer than usual. Your payment is confirmed and your workspace is still being prepared — we will email you the moment it is ready, and you can close this page. If you need us, contact us${order}.`;
}

/**
 * The URL the page polls.
 *
 * Carries Stripe's `session_id` from the return URL so the API can ask Stripe
 * about this order right away instead of waiting for the webhook. It is a
 * cross-check, not a credential: the API acts only if it equals the session
 * the order already stored, and only on Stripe's own answer. Anything that is
 * not shaped like a Checkout Session id is dropped here rather than forwarded.
 */
export function statusPollUrl(onboardingId: string, sessionId?: string | null) {
  const base = `/api/public/onboarding/${encodeURIComponent(onboardingId)}/status`;
  return sessionId && STRIPE_SESSION_ID_PATTERN.test(sessionId)
    ? `${base}?session_id=${encodeURIComponent(sessionId)}`
    : base;
}

/** Mirrors the API's own check; a mismatch only costs the early reconcile. */
export const STRIPE_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{1,250}$/;

/** The short status word above the headline. */
export function eyebrowFor(status: OnboardingStatusView | null) {
  return canOpenWorkspace(status) ? "Workspace ready" : "Setting up";
}

/**
 * What to tell somebody whose status could not be fetched.
 *
 * A 404 is the one case worth distinguishing: the order does not exist, so
 * waiting will not help and the buyer needs a route to a human. Everything else
 * — a 500, a dropped connection, a proxy hiccup — is transient, the poll is
 * still running, and saying "failed" would send somebody to support over a
 * three-second blip.
 */
export function pollErrorMessage(httpStatus: number | null) {
  if (httpStatus === 404) {
    return "We could not find this order. If you have paid, contact us and quote your receipt.";
  }
  return "We could not check your workspace just now. Still trying.";
}

/**
 * How long to wait before the next poll.
 *
 * Not a constant, and the reason is arithmetic. `PublicRateLimitGuard` allows
 * 120 GETs per ten minutes per IP and path, and the status path carries the
 * order id — so this page's whole budget is 120 requests. A flat three-second
 * poll spends 200 of them and starts collecting 429s about six minutes in,
 * which is exactly the case where something has gone slow and the customer is
 * still watching. The page would rate-limit *itself* out of the one situation
 * it exists for.
 *
 * So it starts fast, where payment confirmation and provisioning almost
 * always finish, and backs off once it is clear this is a long wait: every two
 * seconds for the first minute, every four up to three minutes, then every
 * ten. Over the full ten minutes that is about 102 requests — inside the 120
 * budget, with the margin the spec below pins.
 *
 * The first two tiers were stretched from 30s/2min after the API started
 * confirming Stripe payments from this poll itself: the poll is now what
 * moves a delayed-webhook payment forward, so the fast window has to cover
 * the time a payment typically takes to settle, not just provisioning.
 */
export function pollDelayMs(elapsedMs: number) {
  if (elapsedMs < 60_000) return 2_000;
  if (elapsedMs < 180_000) return 4_000;
  return 10_000;
}

/**
 * Back off hard when the platform says we are asking too often.
 *
 * A 429 means the budget above was wrong about something — a reload that reset
 * the page's clock but not the server's window, a second tab, a shared NAT.
 * Retrying at the same cadence turns one 429 into a solid wall of them, so the
 * next attempt waits out a meaningful slice of the window instead.
 */
export const RATE_LIMITED_DELAY_MS = 30_000;

export function nextDelayMs(elapsedMs: number, httpStatus: number | null) {
  return httpStatus === 429
    ? RATE_LIMITED_DELAY_MS
    : pollDelayMs(elapsedMs);
}
