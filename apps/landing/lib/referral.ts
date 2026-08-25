/**
 * The partner referral code a visitor arrived with.
 *
 * A partner's link is `https://…/?ref=CODE`, and the code has to survive from
 * whatever page that link pointed at to whichever form the visitor eventually
 * submits — which may be several pages and a Stripe redirect later.
 *
 * This logic used to live inside `lead-form-section.tsx`, and captured the code
 * in a `useEffect` that only ran when the *lead form* was mounted. A visitor who
 * followed a partner link and went straight to Plans → Subscribe never mounted
 * it, so nothing was captured, and their purchase was recorded as an
 * unattributed direct sale: no error, no empty state, just a customer with no
 * partner and a partner with no commission. BUG-0281.
 *
 * The code is only ever *carried*. It is resolved to a partner server-side, by
 * `PartnerReferralResolverService`; nothing here decides who earns anything, and
 * a forged code attributes nothing because a code is not a partner id.
 */

const STORAGE_KEY = "dijipeople_referral";

/** What a referral code may look like. Anything else is discarded, not fixed. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Codes this platform issues to *itself*, which are never partner codes.
 *
 * `DP-CHK-01` and its siblings are support diagnostics shown on `/subscribe`
 * when a plan cannot be bought — see `CHECKOUT_BLOCK_CODES` in ./plans. They
 * satisfy `CODE_PATTERN` exactly, because a diagnostic code and a partner code
 * are syntactically identical, so nothing here could tell them apart.
 *
 * That is how BUG-1303 happened: the checkout-unavailable panel linked to
 * `/contact?ref=DP-CHK-01`, this module stored it, and first-touch-wins then
 * discarded every real partner code for the next thirty days. The link now
 * passes a dedicated parameter, which is the actual fix.
 *
 * This pattern is the guard behind it, so the next feature to reach for the
 * referral parameter by accident cannot repeat the failure. A rejection here is
 * cheap; a lost commission is not. Anything shaped `DP-<letters>-<digits>` is
 * ours, not a partner's.
 */
const PLATFORM_DIAGNOSTIC_PATTERN = /^DP-[A-Z]{2,6}-\d{1,4}$/i;

/** Thirty days: long enough for a considered purchase, short enough to expire. */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Read `?ref=` from the current URL and remember it.
 *
 * Written to **both** sessionStorage and a first-party cookie. The cookie
 * survives the tab being closed and the Stripe redirect back; sessionStorage is
 * the faster read and the one that survives a cookie-blocking extension. Either
 * alone loses a real cohort of buyers.
 *
 * First touch wins: a visitor who arrives under one partner's link and later
 * clicks another's stays with the first, matching how the lead funnel and
 * `resolveCustomer` both treat attribution. Rewriting it here would make the
 * last click decide a commission.
 *
 * Safe to call on every page and on every render; it is idempotent.
 */
export function captureReferralCodeFromUrl(): void {
  if (typeof window === "undefined") return;

  const fromUrl = new URLSearchParams(window.location.search).get("ref");
  if (!fromUrl || !CODE_PATTERN.test(fromUrl)) return;
  // One of ours, not a partner's. Storing it would occupy the attribution slot
  // that first-touch-wins then refuses to give up — BUG-1303.
  if (PLATFORM_DIAGNOSTIC_PATTERN.test(fromUrl)) return;
  if (readReferralCode()) return;

  const normalized = fromUrl.toUpperCase();

  try {
    window.sessionStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // Private browsing, or storage disabled. The cookie below still works, and
    // failing to record a referral must never break the page a buyer is on.
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${STORAGE_KEY}=${encodeURIComponent(normalized)}; Path=/; ` +
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * The remembered code, or `undefined`.
 *
 * Validated on the way out as well as in: a cookie is user-editable, and while
 * a forged code cannot attribute anything (the server resolves it), sending
 * something that is not a code at all just earns a 400 on an otherwise valid
 * purchase.
 */
export function readReferralCode(): string | undefined {
  if (typeof window === "undefined") return undefined;

  let fromSession: string | null = null;
  try {
    fromSession = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    fromSession = null;
  }

  const fromCookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${STORAGE_KEY}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  const code =
    fromSession ?? (fromCookie ? safeDecode(fromCookie) : undefined);

  if (!code || !CODE_PATTERN.test(code)) return undefined;

  /*
   * Reject a stored diagnostic on the way out, not only on the way in.
   *
   * Every visitor who clicked "Ask us to arrange this plan" before BUG-1303 was
   * fixed is already carrying `dijipeople_referral=DP-CHK-01`, with up to
   * thirty days left on it. Guarding only `captureReferralCodeFromUrl` would
   * stop new poisoning and leave that cohort attributing purchases to an error
   * code — and, worse, still blocking real partner codes, because
   * `captureReferralCodeFromUrl` bails as soon as `readReferralCode()` returns
   * anything at all.
   *
   * Treating it as absent here heals both: the stored value stops being sent,
   * and the next genuine partner link is free to take the slot.
   */
  if (PLATFORM_DIAGNOSTIC_PATTERN.test(code)) return undefined;

  return code.toUpperCase();
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed percent-escape is not a referral code.
    return undefined;
  }
}
