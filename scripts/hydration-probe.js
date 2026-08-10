const { chromium } = require("playwright");

/*
 * Captures the full React hydration diagnostic for a page.
 *
 * The UAT driver truncates console text to keep its report readable, which
 * loses the part that matters: React names the offending attribute and prints
 * a diff of server vs client markup underneath the generic explanation.
 *
 * Usage: node scripts/hydration-probe.js /plans /settings/lead-definitions
 */

const ADMIN = process.env.ADMIN_URL || "http://localhost:3002";
const EMAIL = process.env.UAT_EMAIL || "uat.owner@dijipeople.local";
const PASSWORD = process.env.UAT_PASSWORD || "UatOwner!2026";

const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.error("Pass at least one admin route, e.g. /plans");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  }).then((context) => context.newPage());

  page.on("response", (response) => {
    if (response.url().includes("/api/auth/login"))
      console.error(`  login POST -> ${response.status()}`);
  });

  await page.goto(`${ADMIN}/login`, { waitUntil: "domcontentloaded" });
  /* The submit handler is client-side; clicking before hydration does nothing. */
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  /* The form redirects client-side, so wait on the URL rather than a load. */
  await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 })
    .catch(() => null);
  await page.waitForTimeout(1500);

  if (page.url().includes("/login")) {
    const notice = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    console.error("login failed — still on /login\n", notice.slice(0, 400));
    await browser.close();
    process.exit(1);
  }

  for (const route of routes) {
    const messages = [];
    const onConsole = (message) => {
      if (message.type() !== "error") return;
      /*
       * React passes the server/client diff as extra console arguments, not
       * as part of the first string, so text() alone loses the only part that
       * identifies the offending markup.
       */
      Promise.all(
        message.args().map((arg) => arg.jsonValue().catch(() => null)),
      )
        .then((args) => {
          messages.push(
            args
              .filter((arg) => arg !== null && arg !== "")
              .map((arg) =>
                typeof arg === "string" ? arg : JSON.stringify(arg),
              )
              .join("\n"),
          );
        })
        .catch(() => messages.push(message.text()));
    };
    /* Uncaught React errors arrive here rather than on the console. */
    const onPageError = (error) => messages.push(`pageerror: ${error.message}`);

    page.on("console", onConsole);
    page.on("pageerror", onPageError);

    await page.goto(ADMIN + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);

    page.off("console", onConsole);
    page.off("pageerror", onPageError);

    console.log(`\n${"=".repeat(70)}\n${route}  ->  ${page.url()}`);
    if (messages.length === 0) console.log("  no console errors");
    for (const message of messages) console.log(`\n${message}\n`);
  }

  await browser.close();
})().catch((error) => {
  console.error("PROBE ERROR", error.message);
  process.exit(1);
});
