import { expect, type Page } from '@playwright/test';
import { platformCredentials } from './environment';

/**
 * Sign in to platform admin through the browser.
 *
 * Deliberately not a programmatic cookie injection. The point of this suite is
 * that the UI works, and the admin sign-in path is one that has actually broken
 * in production before — BUG-0008, where the session-expired "Sign in again"
 * link targeted a route exporting only POST and stranded every operator. A
 * suite that skipped the real login would not have caught it.
 */
export async function signInToAdmin(page: Page) {
  const credentials = platformCredentials();
  if (!credentials) throw new Error('No platform credentials in the environment.');

  await page.goto('/login');
  /*
   * The form fields carry ids (`admin-email`, `admin-password`) and associated
   * labels. Addressed by label rather than by CSS class because the classes are
   * Tailwind utility strings that change whenever the design does — a selector
   * on them would break on a restyle and report a functional failure.
   */
  await page.getByLabel('Email', { exact: false }).first().fill(credentials.email);
  await page.getByLabel('Password', { exact: false }).first().fill(credentials.password);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();

  await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
  return credentials;
}

/**
 * Navigate to an admin route and wait for it to settle.
 *
 * The admin app renders server-side and then hydrates a runtime shell, so
 * `networkidle` is the honest signal that a screen finished arriving.
 */
export async function openAdmin(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
