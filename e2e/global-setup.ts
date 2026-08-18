import { BASE_URLS } from './playwright.config';

/**
 * Warm the dev servers before any test runs.
 *
 * Next.js compiles a route the first time it is requested. In dev that first
 * hit can take tens of seconds, and whichever test happens to run first pays
 * it — which is how `D1` came to fail on a 45-second sign-in timeout while the
 * four tests after it signed in and finished in fifteen.
 *
 * The alternative already in this config is a retry, and the config is explicit
 * that a retry "does NOT cover a flaky product". Warming the routes keeps that
 * distinction honest: no test absorbs another's compile time, so a sign-in that
 * genuinely became slow still fails instead of passing on attempt two.
 *
 * Deliberately tolerant. A warm-up that fails the run would turn a missing
 * optional service into a hard stop, and the suites already have preconditions
 * of their own that report precisely what is absent. This only ever removes
 * latency; it never decides whether a suite may run.
 */
const ROUTES = [
  `${BASE_URLS.landing}/`,
  `${BASE_URLS.landing}/plans`,
  `${BASE_URLS.landing}/about`,
  `${BASE_URLS.landing}/contact`,
  `${BASE_URLS.landing}/partners`,
  `${BASE_URLS.landing}/features`,
  `${BASE_URLS.admin}/login`,
  `${BASE_URLS.api}/api/health`,
];

async function warm(url: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    await fetch(url, { signal: controller.signal });
  } catch {
    /* Unreachable or still starting. The suites' own probes will say so. */
  } finally {
    clearTimeout(timer);
  }
}

export default async function globalSetup(): Promise<void> {
  /*
   * Sequential, not parallel. Next dev compiles on demand and a burst of
   * simultaneous cold requests contends for the same compiler, which is the
   * thing being avoided.
   */
  for (const route of ROUTES) {
    await warm(route);
  }
}
