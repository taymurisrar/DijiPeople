import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWeb, signInToWeb, tenantUrl, type TenantTarget } from './web-session';

/**
 * One signed-in browser context per role, for the work journeys (Flow R).
 *
 * The API login is throttled (20 per 10 minutes per source), so each role signs
 * in once and the saved state is cached in the OS temp directory (never in the
 * repository: it holds a live session cookie) and reused by later runs for as
 * long as the session is still accepted.
 *
 * No credential is committed or defaulted. The password comes from
 * `E2E_WEB_PASSWORD` and the suite skips, loudly, when it is absent.
 */

export type WorkRole = 'employee' | 'manager' | 'hr' | 'ceo';

const DEFAULT_EMAILS: Record<WorkRole, string> = {
  employee: 'employee@dijipeople.local',
  manager: 'manager@dijipeople.local',
  hr: 'hr@dijipeople.local',
  ceo: 'ceo@dijipeople.local',
};

export function workTenant(): TenantTarget | null {
  const slug = process.env.E2E_TENANT_SLUG?.trim();
  return slug ? { tenantId: '', slug, name: slug } : null;
}

export function workPassword(): string | null {
  return process.env.E2E_WEB_PASSWORD ?? null;
}

export function roleEmail(role: WorkRole): string {
  return (
    process.env[`E2E_WEB_${role.toUpperCase()}_EMAIL`]?.trim() ||
    DEFAULT_EMAILS[role]
  );
}

const STATE_DIR = join(tmpdir(), 'dijipeople-e2e-work');

function statePath(role: WorkRole, slug: string) {
  return join(STATE_DIR, `${slug}-${role}.json`);
}

async function sessionAlive(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  try {
    const result = await callFrom(page, 'GET', '/api/auth/me');
    return result.status === 200;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

/** A context for the role, signed in, reusing a cached session when it is still valid. */
export async function openRoleContext(
  browser: Browser,
  webBase: string,
  tenant: TenantTarget,
  role: WorkRole,
): Promise<BrowserContext> {
  mkdirSync(STATE_DIR, { recursive: true });
  const file = statePath(role, tenant.slug);

  if (existsSync(file)) {
    const cached = await browser.newContext({
      baseURL: webBase,
      storageState: file,
    });
    if (await sessionAlive(cached)) return cached;
    await cached.close();
  }

  const password = workPassword();
  if (!password) throw new Error('E2E_WEB_PASSWORD is not set');
  const context = await browser.newContext({ baseURL: webBase });
  const page = await context.newPage();
  await signInToWeb(page, webBase, tenant, {
    email: roleEmail(role),
    password,
  });
  await page.close();
  expect(await sessionAlive(context), `${role} session is live`).toBe(true);
  await context.storageState({ path: file });
  return context;
}

/** Navigate a page of a role's context to a tenant route and let it settle. */
export async function gotoWork(
  page: Page,
  webBase: string,
  tenant: TenantTarget,
  path: string,
) {
  await openWeb(page, webBase, tenant, path);
}

export { tenantUrl };

/**
 * A same-origin proxy call made from inside the browser, as the signed-in role.
 *
 * Deliberately not context.request: that runs in Node, and Node cannot resolve
 * <slug>.localhost (ENOTFOUND on Windows) while Chromium can. The page is
 * parked on a cheap same-origin URL so fetch is same-origin and carries the
 * session cookies.
 */
export async function callFrom(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  if (!/^https?:/.test(page.url())) {
    await page.goto('/api/auth/me', { waitUntil: 'domcontentloaded' });
  }
  return page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        cache: 'no-store',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* leave as text */
      }
      return { status: response.status, body: parsed };
    },
    { method, path, body },
  );
}

/** A role's API client: one parked page per context. */
export async function apiFor(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto('/api/auth/me', { waitUntil: 'domcontentloaded' });
  return {
    call: (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: unknown,
    ) => callFrom(page, method, path, body),
    close: () => page.close(),
  };
}
