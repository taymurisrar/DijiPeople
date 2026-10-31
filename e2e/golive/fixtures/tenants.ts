import { env } from './test';
import type { APIRequestContext } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * The three QA tenants. `S` is the seed-demo tenant (kept for comparison — DP-QA-002 was first seen here); `A` and `B` are
 * provisioned through the real platform workflow (customer -> onboarding -> create-tenant) and are the primary targets.
 * Hostnames are `<slug>.localhost:<port>` so the workspace is resolved from the host exactly as in production.
 */
export type TenantKey = 'S' | 'A' | 'B' | 'G';
export type TenantRole = 'ADMIN' | 'OWNER' | 'EMPLOYEE' | 'MANAGER' | 'HR' | 'PAYROLL';

const webUrl = new URL(env.QA_WEB_URL); // protocol and port follow QA_WEB_URL (https://…:3443 when the TLS front is used for WebKit)
export const TENANTS = {
  S: { slug: env.QA_TENANT_SLUG, seeded: true },
  A: { slug: env.QA_TENANT_A_SLUG as string, seeded: false },
  B: { slug: env.QA_TENANT_B_SLUG as string, seeded: false },
  // Growth-plan tenant (RUN-005): used for entitled-import and Growth-gated checks. Optional - suites that need it skip with a reason when it is not provisioned.
  G: { slug: (process.env.QA_TENANT_G_SLUG ?? '') as string, seeded: false },
} as const;
export const growthTenantProvisioned = () => Boolean(process.env.QA_TENANT_G_SLUG && process.env.QA_TENANT_G_OWNER);

export const tenantHost = (t: TenantKey) => `${webUrl.protocol}//${TENANTS[t].slug}.localhost:${webUrl.port}`;
export const tenantUrl = (t: TenantKey, path = '/') => `${tenantHost(t)}${path}`;

export function credentials(t: TenantKey, role: TenantRole): { email: string; password: string } {
  const password = env.QA_PASSWORD;
  if (t === 'S') {
    const map: Record<string, string> = { ADMIN: env.QA_ADMIN_EMAIL, OWNER: env.QA_ADMIN_EMAIL, EMPLOYEE: env.QA_EMPLOYEE_EMAIL, MANAGER: env.QA_MANAGER_EMAIL, HR: env.QA_HR_EMAIL, PAYROLL: env.QA_PAYROLL_EMAIL };
    return { email: map[role], password };
  }
  const prefix = t === 'A' ? 'a' : t === 'B' ? 'b' : 'g';
  const owner = (t === 'A' ? env.QA_TENANT_A_OWNER : t === 'B' ? env.QA_TENANT_B_OWNER : process.env.QA_TENANT_G_OWNER) as string;
  const map: Record<string, string> = { ADMIN: owner, OWNER: owner, EMPLOYEE: `${prefix}-employee@qa.dijipeople.test`, MANAGER: `${prefix}-manager@qa.dijipeople.test`, HR: `${prefix}-hr@qa.dijipeople.test`, PAYROLL: `${prefix}-payroll-manager@qa.dijipeople.test` };
  return { email: map[role], password };
}

export const stateFile = (t: TenantKey, role: TenantRole) => `./golive-results/.auth/${t}-${role}.json`;

/** API sign-in used for data setup and persisted-state assertions (UI sign-in is covered by setup + AUTH suite). */
// File-backed token cache: Playwright restarts a worker after any failed test, which would drop an in-memory cache and
// re-hit the throttled login endpoint (20 per 10 min). Tokens live 30 min; entries are reused for 25.
const TOKEN_FILE = './golive-results/.auth/api-tokens.json';
const readTokens = (): Record<string, { token: string; at: number }> => { try { return existsSync(TOKEN_FILE) ? JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) : {}; } catch { return {}; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function apiToken(request: APIRequestContext, t: TenantKey, role: TenantRole): Promise<string> {
  const key = `${t}/${role}`;
  const hit = readTokens()[key];
  if (hit && Date.now() - hit.at < 25 * 60_000) return hit.token;
  const c = credentials(t, role);
  let r = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email: c.email, password: c.password, tenantSlug: TENANTS[t].slug } });
  for (let i = 0; i < 12 && r.status() === 429; i++) {
    await sleep(15_000);
    r = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email: c.email, password: c.password, tenantSlug: TENANTS[t].slug } });
  }
  const body = await r.json();
  const token = body.accessToken ?? body.tokens?.accessToken;
  if (!token) throw new Error(`API login failed for ${t}/${role}: ${r.status()} ${body.message}`);
  mkdirSync('./golive-results/.auth', { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify({ ...readTokens(), [key]: { token, at: Date.now() } }));
  return token as string;
}

export async function api(request: APIRequestContext, token: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, data?: unknown) {
  const call = () => request.fetch(`${env.QA_API_URL}/api${path}`, { method, headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'web' }, data });
  let r = await call();
  for (let i = 0; i < 14 && r.status() === 429; i++) { await sleep(5_000); r = await call(); }
  let body: unknown = null;
  try { body = await r.json(); } catch { /* empty body */ }
  return { status: r.status(), body: body as any };
}
