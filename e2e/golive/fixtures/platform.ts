import { env } from './test';
import { sql } from './mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * Platform-admin fixture for the RUN-007 subscription architecture (owner FINAL decision, 2026-11-01):
 * exactly THREE predefined plans (starter, growth, enterprise); every other plan is a dynamically created Custom plan.
 * Custom plans are created and assigned ONLY through the supported platform API (POST /super-admin/plans, POST plans/:id/prices, PATCH tenants/:id/subscription) -
 * never by editing Subscription/Plan rows in the database. SQL here is READ-ONLY (assertions on persisted state) or restores a tenant to the plan it had.
 * Everything a test creates is removed in its own `finally` (tenants are moved back to their original plan first; a plan cannot be deleted while assigned).
 */
const genv = env as unknown as Record<string, string | undefined>;
const PH = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };

export const PREDEFINED_PLAN_KEYS = ['starter', 'growth', 'enterprise'] as const;
/** The eight features Starter resolves to (RUN-006): a Custom plan may have FEWER, never inherits more. */
export const STARTER_FEATURES = ['employees', 'organization', 'leave', 'attendance', 'documents', 'notifications', 'branding', 'data-import-export'] as const;
export const GRANT_ONLY_FEATURES = ['desktop-agent', 'email-white-label'] as const;

export const platformConfigured = () => Boolean(genv.QA_PLATFORM_EMAIL && genv.QA_PLATFORM_PASSWORD);

let cached: { token: string; at: number } | null = null;
export async function platformToken(request: APIRequestContext): Promise<string> {
  if (cached && Date.now() - cached.at < 20 * 60_000) return cached.token;
  let r = await request.post(`${env.QA_API_URL}/api/admin/auth/login`, { headers: PH, data: { email: genv.QA_PLATFORM_EMAIL, password: genv.QA_PLATFORM_PASSWORD } });
  for (let i = 0; i < 12 && r.status() === 429; i++) { await new Promise((x) => setTimeout(x, 15_000)); r = await request.post(`${env.QA_API_URL}/api/admin/auth/login`, { headers: PH, data: { email: genv.QA_PLATFORM_EMAIL, password: genv.QA_PLATFORM_PASSWORD } }); }
  const b = await r.json();
  const token = b.accessToken ?? b.tokens?.accessToken;
  if (!token) throw new Error(`platform login failed: ${r.status()} ${String(b.message).slice(0, 100)}`);
  cached = { token, at: Date.now() };
  return token as string;
}

export async function papi(request: APIRequestContext, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
  const token = await platformToken(request);
  const call = () => request.fetch(`${env.QA_API_URL}/api${path}`, { method, headers: { ...PH, authorization: `Bearer ${token}` }, data });
  let r = await call();
  for (let i = 0; i < 10 && r.status() === 429; i++) { await new Promise((x) => setTimeout(x, 5_000)); r = await call(); }
  let body: any = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status(), body };
}

export type CustomPlan = { id: string; key: string; name: string; featureKeys: string[]; priceId?: string };
let counter = 0;
const run = Date.now().toString(36);

/** Creates a Custom plan through the supported mechanism and gives it an active price so it can be assigned. Returns the persisted identity. */
export async function createCustomPlan(request: APIRequestContext, featureKeys: string[], opts: { label?: string; monthly?: number; currency?: string } = {}): Promise<CustomPlan> {
  const key = `qa-cp-${run}-${++counter}`;
  const name = `QA Custom ${opts.label ?? counter} ${run}`;
  const monthly = opts.monthly ?? 25;
  const created = await papi(request, 'POST', '/super-admin/plans', { key, name, description: 'QA custom plan (throwaway)', isActive: true, monthlyBasePrice: monthly, annualBasePrice: monthly * 10, currency: opts.currency ?? 'USD', featureKeys });
  if (created.status >= 300) throw new Error(`create custom plan failed: ${created.status} ${JSON.stringify(created.body).slice(0, 300)}`);
  const id = (created.body.id ?? created.body.plan?.id) as string;
  const price = await papi(request, 'POST', `/super-admin/plans/${id}/prices`, { billingCycle: 'MONTHLY', currency: opts.currency ?? 'USD', unitAmount: monthly, syncToStripe: false, isActive: true });
  return { id, key, name, featureKeys, priceId: price.status < 300 ? (price.body.id ?? price.body.price?.id) : undefined };
}

export type SubscriptionSnapshot = { tenantId: string; planId: string; planPriceId: string | null; status: string; billingCycle: string; startDate: string; endDate: string | null };
export async function tenantIdOf(slug: string): Promise<string> {
  const r = await sql<{ id: string }>(`select id from "Tenant" where slug = $1`, [slug]);
  if (!r[0]) throw new Error(`tenant ${slug} not found`);
  return r[0].id;
}
export async function subscriptionOf(slug: string): Promise<SubscriptionSnapshot> {
  const r = await sql<SubscriptionSnapshot>(`select s."tenantId", s."planId", s."planPriceId", s.status::text as status, s."billingCycle"::text as "billingCycle", s."startDate"::text as "startDate", s."endDate"::text as "endDate" from "Subscription" s join "Tenant" t on t.id = s."tenantId" where t.slug = $1`, [slug]);
  return r[0];
}

/** Assigns a plan to a tenant through the supported API (the same call the platform console makes). */
export async function assignPlan(request: APIRequestContext, slug: string, planId: string, extra: Record<string, unknown> = {}, planPriceId?: string) {
  const tenantId = await tenantIdOf(slug);
  return papi(request, 'PATCH', `/super-admin/tenants/${tenantId}/subscription`, { planId, ...(planPriceId ? { planPriceId } : {}), ...extra });
}
/** Puts a tenant back exactly where it was (plan, price, status, cycle, dates). */
export async function restoreSubscription(request: APIRequestContext, slug: string, s: SubscriptionSnapshot) {
  return assignPlan(request, slug, s.planId, { status: s.status, billingCycle: s.billingCycle, startDate: s.startDate.replace(' ', 'T') + (s.startDate.includes('Z') || s.startDate.includes('+') ? '' : 'Z'), endDate: s.endDate ? s.endDate.replace(' ', 'T') + 'Z' : null }, s.planPriceId ?? undefined);
}
export async function deleteCustomPlan(request: APIRequestContext, plan: CustomPlan | undefined) {
  if (!plan) return;
  await papi(request, 'DELETE', `/super-admin/plans/${plan.id}`).catch(() => undefined);
  // a plan that cannot be deleted (assigned/sold) is at least deactivated so it does not linger in the catalogue
  await papi(request, 'PATCH', `/super-admin/plans/${plan.id}`, { isActive: false }).catch(() => undefined);
}
export async function updateCustomPlanFeatures(request: APIRequestContext, plan: CustomPlan, featureKeys: string[]) {
  const r = await papi(request, 'PATCH', `/super-admin/plans/${plan.id}`, { featureKeys });
  plan.featureKeys = featureKeys;
  return r;
}
/** Feature keys the tenant ACTUALLY resolves to, read from the tenant API (the customer-visible truth). */
export async function resolvedFeatures(request: APIRequestContext, tenantToken: string): Promise<{ plan: string; enabled: string[] }> {
  const r = await request.get(`${env.QA_API_URL}/api/tenant-settings/features`, { headers: { authorization: `Bearer ${tenantToken}`, 'X-DijiPeople-App': 'web' } });
  const b = await r.json();
  return { plan: b.subscription?.plan?.key, enabled: ((b.items ?? []) as Array<{ key: string; isEnabled: boolean }>).filter((i) => i.isEnabled).map((i) => i.key).sort() };
}
