import { expect, test, type Page } from "@playwright/test";

import { BASE_URLS } from "../playwright.config";

/**
 * Landing public-surface regressions.
 *
 * Seeded from the browser QA run that produced BUG-0061..BUG-0066 and
 * ITEM-0051. Every test here corresponds to a defect that actually shipped, so
 * each one should fail if that defect returns — the point of the file is not
 * coverage breadth but keeping six specific regressions from coming back.
 *
 * Unlike flows A and B these need no admin session and no seeded tenant, so
 * they run wherever the landing app is up, which is most of the time.
 */

const LANDING = BASE_URLS.landing;

/** Skip loudly rather than failing for an environmental reason. */
async function landingUp(): Promise<boolean> {
  try {
    const response = await fetch(LANDING, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test.beforeEach(async () => {
  test.skip(
    !(await landingUp()),
    `BROWSER_E2E = BLOCKED_INFRASTRUCTURE — landing app not reachable at ${LANDING}`,
  );
});

/** Console errors the page itself produced. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

test.describe("landing shell", () => {
  /* BUG-0064 — WCAG 2.4.1. Nine header stops before content, on every page. */
  test("skip link is the first tab stop and moves focus into main", async ({
    page,
  }) => {
    await page.goto(`${LANDING}/plans`);
    await page.keyboard.press("Tab");

    const skip = page.locator('a[href="#main-content"]');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();
  });

  /* ITEM-0051 — nothing said which page you were on. */
  test("current page is marked with aria-current", async ({ page }) => {
    await page.goto(`${LANDING}/plans`);
    await expect(
      page.locator('header nav a[aria-current="page"][href="/plans"]'),
    ).toHaveCount(1);
  });

  /* ITEM-0051 — footer links measured 20px tall, below WCAG 2.5.8. */
  test("footer targets clear the minimum size and contact links are actionable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${LANDING}/`);

    const undersized = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("footer a"))
          .map((anchor) => anchor.getBoundingClientRect())
          .filter((rect) => rect.height < 24 || rect.width < 24).length,
    );
    expect(undersized).toBe(0);

    await expect(page.locator('footer a[href^="mailto:"]')).not.toHaveCount(0);
    await expect(page.locator('footer a[href^="tel:"]')).not.toHaveCount(0);
  });
});

/* BUG-0062 — the panel stayed open over the page the visitor had just chosen. */
test.describe("mobile navigation", () => {
  const viewports = [
    { label: "mobile", width: 390, height: 844 },
    { label: "tablet", width: 768, height: 1024 },
  ];

  for (const viewport of viewports) {
    test(`menu closes after navigating (${viewport.label})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(`${LANDING}/`);

      const trigger = page.locator(
        'header button[aria-controls="site-mobile-menu"]',
      );
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");

      await page.locator('#site-mobile-menu a[href="/plans"]').click();
      await page.waitForURL("**/plans");
      await expect(page.locator("#site-mobile-menu")).toHaveCount(0);
    });

    test(`menu closes on Escape and restores focus (${viewport.label})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(`${LANDING}/`);

      const trigger = page.locator(
        'header button[aria-controls="site-mobile-menu"]',
      );
      await trigger.click();
      await expect(page.locator("#site-mobile-menu")).toHaveCount(1);

      await page.keyboard.press("Escape");
      await expect(page.locator("#site-mobile-menu")).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test("no horizontal overflow at any tested viewport", async ({ page }) => {
    const sizes = [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(`${LANDING}/plans`);
      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      );
      expect(overflows, `overflow at ${size.width}x${size.height}`).toBe(false);
    }
  });
});

/* BUG-0063 — a dead submit button and errors no assistive tech could reach. */
test.describe("request a demo", () => {
  test("submit is operable and errors are associated and focused", async ({
    page,
  }) => {
    await page.goto(`${LANDING}/request-demo`);

    const submit = page.locator('form button[type="submit"]');
    await expect(submit).toBeEnabled();

    await submit.click();

    const firstName = page.locator('form input[name="firstName"]');
    await expect(firstName).toHaveAttribute("aria-invalid", "true");
    await expect(firstName).toBeFocused();

    const describedBy = await firstName.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toContainText("required");
  });

  test("page carries exactly one h1", async ({ page }) => {
    await page.goto(`${LANDING}/request-demo`);
    await expect(page.locator("main h1")).toHaveCount(1);
  });

  test("a valid submission is accepted and announced", async ({ page }) => {
    await page.goto(`${LANDING}/request-demo`);
    const stamp = `${Date.now()}`;

    await page.fill('form input[name="firstName"]', "E2E");
    await page.fill('form input[name="lastName"]', "Regression");
    await page.fill('form input[name="companyName"]', `E2E Landing ${stamp}`);
    await page.fill(
      'form input[name="workEmail"]',
      `e2e.${stamp}@landing-regression.test`,
    );
    await page.fill('form input[name="phoneNumber"]', "+1 (312) 555-0184");
    await page.selectOption('form select[name="industry"]', { index: 1 });
    await page.selectOption('form select[name="companySize"]', { index: 1 });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/leads") && r.request().method() === "POST",
      ),
      page.locator('form button[type="submit"]').click(),
    ]);

    expect(response.status()).toBe(201);
    await expect(page.locator('[role="status"]')).toContainText(
      "Request received",
    );
  });
});

/* BUG-0061 / BUG-0065 / BUG-0066 — the commercial surfaces. */
test.describe("commercial surfaces", () => {
  test("plans renders without console errors from the config contract", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    const response = await page.goto(`${LANDING}/plans`);

    expect(response?.status()).toBe(200);
    /*
     * BUG-0065 surfaced as a console error on six routes rather than a broken
     * page, which is exactly the kind of failure that survives a manual pass.
     */
    expect(
      errors.filter((line) => line.includes("commercial-config")),
    ).toHaveLength(0);
  });

  test("subscribe never offers an editable form it cannot submit", async ({
    page,
  }) => {
    await page.goto(`${LANDING}/subscribe`);

    /*
     * The submit button now exists only on the wizard's final step, so its
     * absence no longer means checkout is unavailable — it usually means the
     * visitor is on step one. The notice is what distinguishes the two, and it
     * is rendered beside the price on every step.
     */
    const notice = page.locator("#subscribe-unavailable-notice");
    if ((await notice.count()) === 0) {
      // Checkout is available: the wizard must be walkable.
      await expect(
        page.locator('form button:has-text("Continue")'),
      ).toBeEnabled();
      return;
    }

    // BUG-0066: with checkout unavailable the company-details fields must not
    // be offered at all, and the reason must be stated — not left interactive
    // beside a link that discards them.
    //
    // Scoped to the form on purpose. The plan and billing selectors outside it
    // stay usable so a visitor can check whether a different plan *is*
    // purchasable — removing those would replace one dead end with another.
    await expect(notice).toBeVisible();

    /*
     * BUG-0082 — Continue must be dead too, not just submit. The wizard replaced
     * a single page with five steps, and for a while it would happily collect
     * an organization profile, an owner identity and signed agreements across
     * all of them before revealing a disabled button at the end. Asserting only
     * on the submit control cannot see that, because the submit control is not
     * rendered until the visitor has already done the typing.
     */
    await expect(
      page.locator('form button:has-text("Continue")'),
    ).toBeDisabled();

    /*
     * The step fields are not rendered at all now, rather than rendered and
     * disabled. The assertion is stronger and simpler for it: there is no
     * enabled *or* disabled organization field on the page, because there is no
     * form. A page of dead inputs invited a visitor to read them and guess which
     * one was the problem; removing it leaves the plan and billing selectors as
     * the only live controls, which is exactly what they should reach for.
     */
    const stepFields = await page.evaluate(
      () =>
        document.querySelectorAll(
          "form fieldset input, form fieldset select, form fieldset textarea",
        ).length,
    );
    expect(stepFields).toBe(0);

    /*
     * And the notice quotes a support code. It is what makes "not available"
     * actionable without exposing billing internals — a visitor cannot do
     * anything with "the Stripe price is unverified" and should not be shown
     * it, but they can quote DP-CHK-01.
     */
    await expect(notice).toContainText(/DP-CHK-\d\d/);
  });
});

/* ITEM-0046 — the framework default 404 had no landmark and no title. */
test.describe("not found", () => {
  test("404 keeps the site shell, a heading and a way out", async ({
    page,
  }) => {
    const response = await page.goto(`${LANDING}/this-route-does-not-exist`);

    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(/Page not found/i);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator('main a[href="/"]')).not.toHaveCount(0);
  });
});

/* ITEM-0051 — six routes were indistinguishable in history and search. */
test.describe("metadata", () => {
  const routes = [
    { path: "/partners", title: /Partner network/i },
    /*
     * "Setting up your workspace", not "Subscription confirmed". The page no
     * longer congratulates anybody on arrival: a Stripe redirect is not the
     * provider's word that payment succeeded, only the verified webhook is, so
     * the page reports what the status endpoint says and its title matches.
     */
    { path: "/subscribe/success", title: /Setting up your workspace/i },
    { path: "/subscribe/cancel", title: /Checkout cancelled/i },
  ];

  for (const route of routes) {
    test(`${route.path} sets its own title`, async ({ page }) => {
      await page.goto(`${LANDING}${route.path}`);
      await expect(page).toHaveTitle(route.title);
    });
  }
});

/* ITEM-0051 — recorded as a hydration mismatch; kept as a standing guard. */
test.describe("hydration", () => {
  test("partner activation hydrates without console errors", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${LANDING}/partners/activate/regression-probe-token`);
    await page.waitForTimeout(2500);

    expect(
      errors.filter((line) => /hydrat/i.test(line)),
      errors.join(" | "),
    ).toHaveLength(0);
  });
});
