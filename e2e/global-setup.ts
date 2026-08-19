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
 * **The whole warm-up shares one budget.** The first version gave each of eight
 * routes its own 120-second timeout — up to sixteen minutes of waiting before a
 * single test ran. On a cold CI runner that is exactly what happened: the
 * `Browser e2e` job hit its 30-minute limit and was cancelled, so a suite that
 * passes locally produced no CI evidence at all. A warm-up that can outlast the
 * tests it exists to speed up is not an optimisation.
 *
 * So: a total budget, checked between routes and enforced per request. Running
 * out of budget is not a failure — it means the tests start now and the first
 * one absorbs whatever compile remains, which is the situation this file
 * improves on rather than guarantees against.
 */
const ROUTES = [
  `${BASE_URLS.api}/api/health`,
  `${BASE_URLS.admin}/login`,
  `${BASE_URLS.landing}/`,
  `${BASE_URLS.landing}/plans`,
  `${BASE_URLS.landing}/about`,
  `${BASE_URLS.landing}/contact`,
  `${BASE_URLS.landing}/partners`,
  `${BASE_URLS.landing}/features`,
];

/**
 * Ninety seconds for everything.
 *
 * Enough to absorb the compiles that actually hurt — the API health check and
 * the admin login route, which is why those two come first — without ever being
 * a meaningful share of the job. The remaining routes are a bonus.
 */
const TOTAL_BUDGET_MS = 90_000;

async function warm(url: string, budgetMs: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    await fetch(url, { signal: controller.signal });
  } catch {
    /*
     * Unreachable, still starting, or out of budget. The suites' own
     * preconditions report precisely what is absent; this only ever removes
     * latency and never decides whether a suite may run.
     */
  } finally {
    clearTimeout(timer);
  }
}

export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  /*
   * Sequential, not parallel. Next dev compiles on demand and a burst of
   * simultaneous cold requests contends for the same compiler, which is the
   * thing being avoided. Ordered by how much each route's compile costs a test
   * that would otherwise pay it first.
   */
  for (const route of ROUTES) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await warm(route, remaining);
  }
}
