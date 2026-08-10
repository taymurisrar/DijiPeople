const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

/*
 * Drives the landing and admin apps in a real browser, as a user would.
 *
 * Records per page: HTTP status, console errors, failed requests, and whether
 * the body rendered content or an error screen. Screenshots go to disk so a
 * blank frame is visible rather than inferred.
 *
 * Console text is kept whole. The earlier version of this driver truncated it
 * to 200 characters, which cut off the part of a React hydration warning that
 * names the offending attribute — the only part worth having.
 *
 * Every route below is reachable from the running app. Routes that no
 * navigation offers are not evidence of anything when they 404.
 *
 * Usage: node scripts/uat-admin.js
 */

const OUT = process.env.UAT_OUT || "uat-out";
const ADMIN = process.env.ADMIN_URL || "http://localhost:3002";
const LANDING = process.env.LANDING_URL || "http://localhost:3000";
const EMAIL = process.env.UAT_EMAIL || "uat.owner@dijipeople.local";
const PASSWORD = process.env.UAT_PASSWORD || "UatOwner!2026";

const LANDING_ROUTES = ["/", "/plans", "/contact", "/about", "/partners"];

const ADMIN_ROUTES = [
  "/", "/tenants", "/customers", "/leads", "/partners", "/partner-inquiries",
  "/partner-onboarding", "/contracts", "/contract-templates",
  "/signature-requests", "/billing", "/invoices", "/payments", "/subscriptions",
  "/plans", "/commissions", "/onboarding", "/support/cases", "/notifications",
  "/profile", "/preferences", "/security", "/account-settings", "/settings",
  "/settings/billing", "/settings/branding", "/settings/company-profile",
  "/settings/contracts", "/settings/customer-definitions", "/settings/customers",
  "/settings/demo-data", "/settings/email", "/settings/features",
  "/settings/invoices", "/settings/lead-definitions", "/settings/monitoring",
  "/settings/monitoring/error-logs", "/settings/onboarding-definitions",
  "/settings/partners", "/settings/plans", "/settings/platform-defaults",
  "/settings/security", "/settings/support", "/settings/users",
];

/* Grids whose view tabs must each return a page that renders. */
const VIEW_CHECKS = [
  ["/customers", ["all", "active", "my-records"]],
  ["/invoices", ["all", "active", "my-records"]],
  ["/signature-requests", ["all", "active", "my-records"]],
  ["/settings/monitoring/error-logs", ["all", "critical", "new", "resolved"]],
];

fs.mkdirSync(OUT, { recursive: true });
const results = [];

async function visit(page, label, url, settle = 1400) {
  const consoleErrors = [];
  const failedRequests = [];

  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  const onFailed = (request) => {
    const reason = request.failure()?.errorText ?? "unknown";
    /*
     * Next cancels in-flight link prefetches when the page navigates away.
     * Those abort by design and say nothing about the app, so counting them
     * made every page look like it had four failed requests.
     */
    if (reason === "net::ERR_ABORTED" && request.url().includes("_rsc=")) return;
    failedRequests.push(`${request.method()} ${request.url()} (${reason})`);
  };
  const onResponse = (response) => {
    if (response.status() >= 400 && !response.url().includes("favicon"))
      failedRequests.push(`${response.status()} ${response.url()}`);
  };

  page.on("console", onConsole);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);

  let status = 0;
  let error = null;
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    status = response ? response.status() : 0;
    await page.waitForTimeout(settle);
  } catch (thrown) {
    error = thrown.message.split("\n")[0].slice(0, 200);
  }

  let text = "";
  try {
    text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  } catch {
    /* A crashed page cannot be read; its absence is itself the signal. */
  }

  try {
    await page.screenshot({
      path: path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, "-")}.png`),
    });
  } catch {
    /* Screenshots fail on a crashed page. */
  }

  page.off("console", onConsole);
  page.off("requestfailed", onFailed);
  page.off("response", onResponse);

  results.push({
    label,
    url,
    status,
    chars: text.length,
    looksBroken:
      /application error|something went wrong|unhandled|internal server error|page not found/i.test(
        text,
      ),
    error,
    consoleErrors: [...new Set(consoleErrors)],
    failedRequests: [...new Set(failedRequests)],
    excerpt: text.slice(0, 100),
  });
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  for (const route of LANDING_ROUTES) {
    await visit(page, `landing${route.replace(/\//g, "-")}`, LANDING + route);
  }

  await visit(page, "admin-login", ADMIN + "/login");

  let loginStatus = "no POST observed";
  page.on("response", (response) => {
    if (response.url().includes("/api/auth/login"))
      loginStatus = String(response.status());
  });

  /* The submit handler is client-side; clicking before hydration does nothing. */
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(1200);
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 })
    .catch(() => null);
  await page.waitForTimeout(2000);

  const loggedIn = !page.url().includes("/login");
  results.push({
    label: "admin-login-submit",
    url: page.url(),
    status: loggedIn ? 200 : 0,
    chars: 0,
    looksBroken: !loggedIn,
    error: loggedIn
      ? null
      : `still on /login after submit (login POST -> ${loginStatus})`,
    consoleErrors: [],
    failedRequests: [],
    excerpt: `landed on ${page.url()}`,
  });

  if (!loggedIn) {
    fs.writeFileSync(
      path.join(OUT, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.error("login failed — stopping, nothing below it would be valid");
    await browser.close();
    process.exit(1);
  }

  for (const route of ADMIN_ROUTES) {
    await visit(page, `admin${route.replace(/\//g, "-")}`, ADMIN + route);
  }

  for (const [route, views] of VIEW_CHECKS) {
    for (const view of views) {
      await visit(
        page,
        `view${route.replace(/\//g, "-")}-${view}`,
        `${ADMIN}${route}?viewId=${view}`,
      );
    }
  }

  fs.writeFileSync(
    path.join(OUT, "results.json"),
    JSON.stringify(results, null, 2),
  );

  const problems = results.filter(
    (result) =>
      result.looksBroken ||
      result.error ||
      result.status >= 400 ||
      result.consoleErrors.length > 0 ||
      result.failedRequests.length > 0,
  );

  console.log(`pages visited:          ${results.length}`);
  console.log(`pages with a problem:   ${problems.length}`);
  for (const problem of problems) {
    console.log(`\n--- ${problem.label} [${problem.status}] ${problem.url}`);
    if (problem.error) console.log(`    error: ${problem.error}`);
    if (problem.looksBroken) console.log(`    body: ${problem.excerpt}`);
    for (const failed of problem.failedRequests.slice(0, 4))
      console.log(`    request: ${failed}`);
    for (const consoleError of problem.consoleErrors.slice(0, 2))
      console.log(`    console: ${consoleError.slice(0, 600)}`);
  }

  await browser.close();
  process.exit(problems.length > 0 ? 1 : 0);
})().catch((error) => {
  console.error("DRIVER ERROR", error.message);
  process.exit(1);
});
