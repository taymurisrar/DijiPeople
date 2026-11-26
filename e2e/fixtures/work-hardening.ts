import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { BASE_URLS } from '../playwright.config';
import {
  apiFor,
  gotoWork,
  openRoleContext,
  type WorkRole,
} from './work-sessions';
import type { TenantTarget } from './web-session';

/**
 * Shared plumbing for Flow S (work hardening): role contexts for two tenants,
 * an API client that waits out the 429 throttle, and small UI helpers that
 * match the app's custom controls.
 */

export type Api = Awaited<ReturnType<typeof apiFor>>;
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const WEB = BASE_URLS.web;
export const OTHER_WEB = process.env.E2E_OTHER_WEB_URL?.trim() || '';
export const OTHER_SLUG = process.env.E2E_OTHER_TENANT_SLUG?.trim() || '';

export const RUN = `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 36).toString(36)}`;

export function escapeRe(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ymd(offsetDays = 0, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A labelled input: the app appends " *" to required labels, so match the start. */
export function field(scope: Page | Locator, label: string) {
  return scope.getByLabel(new RegExp(`^${escapeRe(label)}`));
}

/** Pick an option of the app's custom combobox (SelectField). */
export async function choose(
  page: Page,
  scope: Page | Locator,
  label: string | RegExp,
  option: string | RegExp,
) {
  const name = typeof label === 'string' ? new RegExp(`^${escapeRe(label)}`) : label;
  await scope.getByRole('combobox', { name }).click();
  await page.getByRole('option', { name: option }).first().click();
}

export async function alertText(scope: Page | Locator): Promise<string> {
  const alert = scope.getByRole('alert').filter({ hasText: /\S/ }).first();
  await expect(alert).toBeVisible();
  return ((await alert.textContent()) ?? '').trim();
}

export function newTenantTarget(slug: string): TenantTarget {
  return { tenantId: '', slug, name: slug };
}

export class Workspace {
  readonly contexts = {} as Record<WorkRole, BrowserContext>;
  readonly apis = {} as Record<WorkRole, Api>;
  readonly employeeIds = {} as Record<WorkRole, string>;
  readonly pages = new Set<Page>();

  constructor(
    readonly base: string,
    readonly tenant: TenantTarget,
  ) {}

  async signIn(
    browser: Parameters<typeof openRoleContext>[0],
    roles: WorkRole[],
  ) {
    for (const role of roles) {
      this.contexts[role] = await openRoleContext(browser, this.base, this.tenant, role);
      this.apis[role] = await apiFor(this.contexts[role]);
      const me = await this.apis[role].call('GET', '/api/auth/me');
      this.employeeIds[role] = me.body?.user?.employeeId;
    }
  }

  async open(role: WorkRole, path: string): Promise<Page> {
    const page = await this.contexts[role].newPage();
    this.pages.add(page);
    await gotoWork(page, this.base, this.tenant, path);
    await waitOutThrottle(page, () => gotoWork(page, this.base, this.tenant, path));
    return page;
  }

  async release(page: Page) {
    this.pages.delete(page);
    await page.close().catch(() => undefined);
  }

  async releaseAll() {
    for (const page of [...this.pages]) await this.release(page);
  }

  /** The API as a role; fails the test with the body when the status is unexpected. */
  async api(
    role: WorkRole,
    method: Method,
    path: string,
    body?: unknown,
    expectStatus: number | 'ok' = 'ok',
  ) {
    const result = await this.raw(role, method, path, body);
    const good =
      expectStatus === 'ok'
        ? result.status >= 200 && result.status < 300
        : result.status === expectStatus;
    expect(
      good,
      `${role} ${method} ${path} -> ${result.status} ${JSON.stringify(result.body)?.slice(0, 400)}`,
    ).toBe(true);
    return result.body;
  }

  async raw(role: WorkRole, method: Method, path: string, body?: unknown) {
    let result = await this.apis[role].call(method, path, body);
    for (let attempt = 0; attempt < 6 && result.status === 429; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      result = await this.apis[role].call(method, path, body);
    }
    return result;
  }

  async close() {
    await this.releaseAll();
    for (const role of Object.keys(this.apis) as WorkRole[]) {
      await this.apis[role].close().catch(() => undefined);
    }
    for (const role of Object.keys(this.contexts) as WorkRole[]) {
      await this.contexts[role].close().catch(() => undefined);
    }
  }
}

/**
 * The API throttles per source address; a long run can trip it (a
 * RATE_LIMIT_EXCEEDED modal). That is the environment, not the product: wait
 * the window out and reload rather than report a false failure.
 */
export async function waitOutThrottle(page: Page, reload: () => Promise<unknown>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!(await page.getByText('RATE_LIMIT_EXCEEDED').count())) return;
    await page.waitForTimeout(30_000);
    await reload();
  }
}

/**
 * The tenant app raises a blocking "ERROR <code>" modal for any failed API call
 * (alongside whatever inline message the screen shows). A journey that provokes
 * a refusal on purpose dismisses it, asserting it carries the API's message.
 */
export async function dismissErrorModal(page: Page, messagePattern?: RegExp) {
  const modal = page.locator('[role="presentation"]').filter({ hasText: 'REFERENCE ID' }).last();
  await expect(modal).toBeVisible();
  if (messagePattern) await expect(modal).toContainText(messagePattern);
  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toBeHidden();
}
