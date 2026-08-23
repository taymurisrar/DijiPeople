/**
 * Which landing deployment this run is pointed at, and what it is allowed to do
 * there.
 *
 * The landing suite is deliberately runnable against production. That is the
 * whole point of a public marketing surface — most of what can go wrong with it
 * (a 500 on the front door, a dead CTA, a plan card quoting the wrong currency,
 * a form that silently drops submissions) is only true of the deployment people
 * actually visit, and none of it is provable from localhost.
 *
 * But "runnable against production" and "free to do anything against
 * production" are different claims. A checkout test that completes creates a
 * real customer, a real Stripe charge and a real tenant. So every spec that
 * writes declares itself, and `assertWritesAllowed` refuses on a production
 * target unless the operator opted in explicitly and per-run.
 *
 * The default is refusal. An environment variable that has to be set on purpose
 * is the only thing standing between a full-coverage suite and an accidental
 * charge on a live account, so it is checked here rather than remembered in
 * each spec.
 */

/** Trailing slashes make every template literal below ambiguous. */
function trimUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

const landing = trimUrl(process.env.E2E_LANDING_URL ?? 'http://localhost:3010');
const api = trimUrl(process.env.E2E_API_URL ?? 'http://localhost:4001/api');

/**
 * Production is recognised from the URL, not from a flag the caller sets.
 *
 * A flag would be wrong the first time someone pointed `E2E_LANDING_URL` at
 * production and forgot to also set `E2E_TARGET=prod`. The hostname is the
 * fact; anything derived from it cannot disagree with it.
 */
const isProduction = /(^|\.)dijipeople\.com$/i.test(new URL(landing).hostname);

export const TARGET = {
  landing,
  api,
  isProduction,
  label: isProduction ? 'production' : 'local',
  /**
   * Whether this run may create durable records — leads, onboarding sessions,
   * orders, tenants.
   *
   * Local: always. Production: only with `E2E_ALLOW_PROD_WRITES=yes`, which is
   * spelled out rather than truthy so that a stray `1` inherited from some
   * other tool cannot enable it.
   */
  writesAllowed: !isProduction || process.env.E2E_ALLOW_PROD_WRITES === 'yes',
} as const;

/** Every public route the site serves, and whether it needs a token. */
export const STATIC_ROUTES = [
  { path: '/', name: 'home' },
  { path: '/plans', name: 'plans' },
  { path: '/features', name: 'features' },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/partners', name: 'partners' },
  { path: '/request-demo', name: 'request-demo' },
  { path: '/subscribe', name: 'subscribe' },
  { path: '/subscribe/cancel', name: 'subscribe-cancel' },
] as const;

/**
 * The legal routes.
 *
 * Kept separate from `STATIC_ROUTES` because they are the one family that is
 * *expected* to render an empty state: the route exists whether or not a
 * version is published, by design (`legal-server.ts`). A test that demanded
 * content here would fail correctly on a pre-launch deployment and tell nobody
 * anything.
 */
export const LEGAL_SLUGS = [
  'privacy',
  'terms',
  'billing-terms',
  'refund-policy',
  'cookie-policy',
  'acceptable-use',
  'security',
  'subprocessors',
  'data-retention',
  'dpa',
] as const;

/** Is the target reachable at all? Used to skip loudly, never to fail. */
export async function targetUp(): Promise<boolean> {
  try {
    const response = await fetch(TARGET.landing, {
      signal: AbortSignal.timeout(15_000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Unique per run, so a run that died before cleanup cannot collide with the
 * next one, and so every row this suite created is identifiable afterwards by
 * prefix alone.
 */
export const RUN_ID = `e2e${Date.now().toString(36)}`;

/** The marker every record this suite creates carries, for later cleanup. */
export const RUN_TAG = `dpqa-${RUN_ID}`;
