// Probes GET endpoints as a QA role against the isolated API and prints status codes.
// Usage: node e2e/golive/tools/probe-api.mjs ROLE /path1 /path2 ...
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const [role, ...paths] = process.argv.slice(2);
const login = await fetch(`${env.QA_API_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-DijiPeople-App': 'web' },
  body: JSON.stringify({ email: env[`QA_${role.toUpperCase()}_EMAIL`], password: env.QA_PASSWORD, tenantSlug: env.QA_TENANT_SLUG }),
});
const body = await login.json();
const token = body.accessToken ?? body.tokens?.accessToken ?? body.session?.accessToken;
if (!token) { console.error('no token; keys:', Object.keys(body)); process.exit(1); }
for (const p of paths) {
  const r = await fetch(`${env.QA_API_URL}/api${p}`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'web' } });
  const t = await r.text();
  console.log(r.status, p, t.slice(0, 160).replace(/\s+/g, ' '));
}
