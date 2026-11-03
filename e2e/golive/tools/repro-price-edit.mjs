// RUN-008 reproduction for PUB-007: PATCH the amount of a PUBLISHED Custom plan price. Local isolated API only.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing');
const api = env.QA_API_URL + '/api'; const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };
const call = async (m, p, b, t) => { const r = await fetch(api + p, { method: m, headers: { ...H, ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.text(); console.log(m, p.replace(/[0-9a-f-]{36}/g, ':id'), r.status, x.slice(0, 420)); try { return JSON.parse(x); } catch { return {}; } };
const l = await call('POST', '/admin/auth/login', { email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD }); const t = l.accessToken ?? l.tokens?.accessToken;
const key = 'qa-repro-' + Date.now().toString(36);
const p = await call('POST', '/super-admin/plans', { key, name: key, isActive: true, monthlyBasePrice: 40, annualBasePrice: 400, currency: 'USD', featureKeys: ['employees'] }, t);
const pr = await call('POST', `/super-admin/plans/${p.id}/prices`, { billingCycle: 'MONTHLY', billingModel: 'FLAT', currency: 'USD', unitAmount: 40, syncToStripe: false, isActive: true }, t);
await call('PATCH', `/super-admin/plans/${p.id}/prices/${pr.id}`, { unitAmount: 41, syncToStripe: false }, t);                      // DRAFT edit
await call('POST', `/super-admin/plans/${p.id}/prices/${pr.id}/publish`, null, t);
await call('PATCH', `/super-admin/plans/${p.id}/prices/${pr.id}`, { unitAmount: 45, syncToStripe: false }, t);                      // PUBLISHED edit (the PUB-007 call)
await call('PATCH', `/super-admin/plans/${p.id}/prices/${pr.id}`, { unitAmount: 45, currency: 'USD', billingCycle: 'MONTHLY', syncToStripe: false }, t);
await call('DELETE', `/super-admin/plans/${p.id}`, null, t);
