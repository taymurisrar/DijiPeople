// Provisions a tenant through the REAL platform flow (customer -> onboarding record -> create-tenant),
// NOT seed-demo. Usage: node provision-tenant.mjs <slug> "<Company Name>" <ownerEmail> [planKey=starter]
// Targets the isolated QA API only (guarded). Prints status codes and error bodies, never secrets.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: QA_API_URL not localhost');
const [slug, company, ownerEmail, planKey = 'starter'] = process.argv.slice(2);
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };

async function call(method, path, body, token) {
  const r = await fetch(api + path, { method, headers: { ...H, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.error(`${method} ${path} -> ${r.status}`, JSON.stringify(json).slice(0, 700)); process.exit(1); }
  console.log(`${method} ${path} -> ${r.status}`);
  return json;
}

const login = await call('POST', '/admin/auth/login', { email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD });
const token = login.accessToken ?? login.tokens?.accessToken;
if (!token) { console.error('no token; keys', Object.keys(login)); process.exit(1); }

const plans = await call('GET', '/super-admin/plans', null, token);
const plan = (Array.isArray(plans) ? plans : plans.items).find((p) => p.key === planKey);
const customer = await call('POST', '/super-admin/customers', {
  companyName: company, primaryContactFirstName: 'Qa', primaryContactLastName: 'Owner', primaryContactEmail: ownerEmail, country: 'Qatar', industry: 'Technology', companySize: '11-50', selectedPlanId: plan.id, preferredBillingCycle: 'MONTHLY',
}, token);
const customerId = customer.id ?? customer.customer?.id;
const rec = await call('POST', '/super-admin/customer-onboarding', {
  customerId, selectedPlanId: plan.id, plannedTenantSlug: slug, billingCycle: 'MONTHLY',
  primaryOwnerFirstName: 'Qa', primaryOwnerLastName: 'Owner', primaryOwnerWorkEmail: ownerEmail,
  contractSigned: true, paymentConfirmed: true, implementationKickoffDone: true, dataReceived: true,
  configurationReady: true, trainingPlanned: true,
}, token);
const onboardingId = rec.id ?? rec.onboarding?.id;
// FIXTURE SHORTCUT (documented in QA-RUNBOOK): the real gate needs a counter-executed SUBSCRIPTION_AGREEMENT from the
// contracts workflow. QA inserts one executed row directly in the throwaway DB so tenant creation itself is the real path.
if (!/dijipeople_starterqa_test/.test(env.QA_DATABASE_URL)) throw new Error('refusing: not the QA db');
const pg = new Client({ connectionString: env.QA_DATABASE_URL }); await pg.connect();
await pg.query(`insert into "Contract"(id,"contractNumber",title,"contractType",status,"counterpartyName","customerOnboardingId","customerAccountId","updatedAt") values (gen_random_uuid(),$1,$2,'SUBSCRIPTION_AGREEMENT','FULLY_SIGNED',$3,$4,$5,now())`, ['QA-' + Date.now(), 'QA fixture agreement', company, onboardingId, customerId]);
await pg.end();
await call('PATCH', '/super-admin/customer-onboarding/' + onboardingId, { status: 'IN_PROGRESS', subStatus: 'Configuration in progress' }, token);
await call('PATCH', '/super-admin/customer-onboarding/' + onboardingId, { status: 'READY_FOR_TENANT_CREATION', subStatus: 'Tenant setup pending' }, token);
const t = await call('POST', `/super-admin/customer-onboarding/${onboardingId}/create-tenant`, { tenantName: company, slug, planId: plan.id, billingCycle: 'MONTHLY' }, token);
console.log('tenant result keys:', Object.keys(t).join(','), '| id:', t.tenant?.id ?? t.id);
