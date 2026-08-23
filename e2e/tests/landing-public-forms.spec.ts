import { expect, test, type Page } from '@playwright/test';

import { RUN_ID, TARGET, targetUp } from '../fixtures/landing-target';

/**
 * The three public forms: contact, partner inquiry, and request-a-demo.
 *
 * `apps/landing/AGENTS.md` lists `/contact` and every `app/api/**` proxy as
 * untested at every level. These are the tests that were missing.
 *
 * Negative cases run everywhere, including production, because refusing a bad
 * submission writes nothing. The positive cases create a lead or a partner
 * inquiry, so they are skipped unless writes are allowed for the target — see
 * `TARGET.writesAllowed`. That default is what stops a full-coverage run
 * seeding somebody's real CRM.
 */

test.beforeEach(async () => {
  test.skip(
    !(await targetUp()),
    `BROWSER_E2E = BLOCKED_INFRASTRUCTURE — landing not reachable at ${TARGET.landing}`,
  );
});

/** Requests the page made to its own API proxies. */
function collectApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/\/api\//.test(url) && !/_next/.test(url)) {
      calls.push(`${request.method()} ${new URL(url).pathname}`);
    }
  });
  return calls;
}

type FormCase = {
  name: string;
  path: string;
  submit: RegExp;
  /** The endpoint a successful submission must reach. */
  endpoint: RegExp;
  /** Confirmation copy the visitor must actually see afterwards. */
  confirmation: RegExp;
};

const FORMS: FormCase[] = [
  {
    name: 'contact',
    path: '/contact',
    submit: /send inquiry/i,
    endpoint: /\/api\/leads/,
    confirmation: /we.{0,3}ve received your inquiry|thank/i,
  },
  {
    name: 'partner inquiry',
    path: '/partners',
    submit: /submit partner inquiry/i,
    endpoint: /\/api\/partners/,
    confirmation: /thank|received|reference/i,
  },
  {
    name: 'request a demo',
    path: '/request-demo',
    submit: /request demo/i,
    endpoint: /\/api\/leads/,
    confirmation: /thank|received|be in touch/i,
  },
];

test.describe('public forms refuse what they should', () => {
  for (const form of FORMS) {
    test(`${form.name} does not submit an empty form`, async ({ page }) => {
      const calls = collectApiCalls(page);
      await page.goto(`${TARGET.landing}${form.path}`, { waitUntil: 'networkidle' });

      await page.getByRole('button', { name: form.submit }).last().click();
      await page.waitForTimeout(1200);

      /*
       * The assertion is about the *request*, not about which error text
       * appeared. Two of these forms report through per-field messages and one
       * leans on native constraint validation; both are legitimate, and pinning
       * the copy would make this a test of the wording rather than of the rule.
       * What matters is that nothing was written.
       */
      expect(
        calls.filter((c) => form.endpoint.test(c)),
        'an empty form must not reach the API',
      ).toEqual([]);
    });

    test(`${form.name} does not submit a malformed email`, async ({ page }) => {
      const calls = collectApiCalls(page);
      await page.goto(`${TARGET.landing}${form.path}`, { waitUntil: 'networkidle' });

      const email = page.locator('form input[type=email]').first();
      await expect(email).toBeVisible();
      await email.fill('definitely-not-an-email');

      await page.getByRole('button', { name: form.submit }).last().click();
      await page.waitForTimeout(1200);

      expect(
        calls.filter((c) => form.endpoint.test(c)),
        'a malformed email must not reach the API',
      ).toEqual([]);
    });
  }
});

test.describe('public forms accept what they should', () => {
  test.skip(
    !TARGET.writesAllowed,
    `writes are not allowed against ${TARGET.label} — set E2E_ALLOW_PROD_WRITES=yes to include them`,
  );

  for (const form of FORMS) {
    test(`${form.name} submits and confirms`, async ({ page }) => {
      const calls = collectApiCalls(page);
      await page.goto(`${TARGET.landing}${form.path}`, { waitUntil: 'networkidle' });

      /*
       * Filled by reading the form rather than from a fixture: these three were
       * built at different times and do not share a field list, and a
       * hard-coded one would rot the first time a field is added. The honeypot
       * is deliberately left empty — filling it is what a bot does, and the API
       * drops the request without creating anything.
       */
      const controls = await page.evaluate(() =>
        Array.from(document.querySelectorAll('form input, form select, form textarea'))
          .filter((c) => (c as HTMLInputElement).type !== 'hidden')
          .map((c) => ({
            name: c.getAttribute('name'),
            type: c.getAttribute('type') ?? c.tagName.toLowerCase(),
            required: c.hasAttribute('required'),
          })),
      );

      for (const control of controls) {
        if (!control.name || control.name === 'website') continue;
        const field = page.locator(`form [name="${control.name}"]`).first();
        if (!(await field.count())) continue;

        const tag = await field.evaluate((el) => el.tagName.toLowerCase());
        if (tag === 'select') {
          const value = await field
            .locator('option')
            .nth(1)
            .getAttribute('value');
          if (value) await field.selectOption(value);
        } else if (control.type === 'checkbox') {
          // Required consent is ticked; optional marketing consent is not,
          // because a visitor who says nothing has not opted in.
          if (control.required) await field.check();
        } else if (control.type === 'email') {
          await field.fill(`qa+${RUN_ID}@dijipeople.local`);
        } else if (control.type === 'tel') {
          await field.fill('+974 5555 0100');
        } else {
          await field.fill(`QA ${RUN_ID}`);
        }
      }

      await page.getByRole('button', { name: form.submit }).last().click();

      await expect
        .poll(() => calls.filter((c) => form.endpoint.test(c)).length, {
          message: `${form.name} should reach ${form.endpoint}`,
          timeout: 20_000,
        })
        .toBeGreaterThan(0);

      // The visitor is told it worked — a 201 nobody sees is not a submission.
      await expect(page.locator('main')).toContainText(form.confirmation, {
        timeout: 20_000,
      });
    });
  }
});

test.describe('bot protection', () => {
  /*
   * `website` is named for what an autofilling bot looks for: a real visitor
   * never sees it, so anything in it means the request came from a script and
   * the API drops it without creating a record. The organization's *real*
   * website is `companyWebsite` — the two are easy to confuse, and the partner
   * form legitimately has a visible field called `website`, which is why this
   * asserts visibility rather than merely counting the name.
   */
  /*
   * Located structurally, because the field carries no `name`: it is a
   * React-controlled input inside `<div class="hidden" aria-hidden="true">`,
   * and its value reaches the API as `website` through component state rather
   * than through form serialisation.
   *
   * That is worth knowing rather than papering over. A honeypot earns its keep
   * by looking like a field a bot wants to fill, and the cues a naive bot reads
   * are `name` and `autocomplete` — this input has no `name` and sets
   * `autoComplete="off"`. It will still catch something that fills every input
   * it can see, and will miss anything selecting by name. ITEM-0089.
   */
  test('the demo form carries a hidden honeypot', async ({ page }) => {
    await page.goto(`${TARGET.landing}/request-demo`, { waitUntil: 'networkidle' });

    const honeypot = page.locator('form div[aria-hidden="true"] input');
    await expect(honeypot).toHaveCount(1);
    await expect(honeypot).toBeHidden();
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
  });

  test("the partner form's website field is a real, visible field", async ({ page }) => {
    await page.goto(`${TARGET.landing}/partners`, { waitUntil: 'networkidle' });

    const field = page.locator('form input[name="website"]');
    await expect(field).toHaveCount(1);
    await expect(field, 'this one is Company website, not a trap').toBeVisible();
  });

  /*
   * ITEM-0089 — `/contact` has no honeypot at all, while the sibling demo form
   * on the same site does. It is not unprotected (`PublicRateLimitGuard` allows
   * 20 writes per IP per ten minutes) but it is the only public lead-creating
   * form without the cheap first line of defence.
   *
   * Asserted as it is today rather than as it should be, so this test tells the
   * truth now and turns into the regression the moment a honeypot is added.
   */
  test('the contact form has no honeypot — recorded, not endorsed', async ({ page }) => {
    await page.goto(`${TARGET.landing}/contact`, { waitUntil: 'networkidle' });
    await expect(page.locator('form input[name="website"]')).toHaveCount(0);
  });
});
