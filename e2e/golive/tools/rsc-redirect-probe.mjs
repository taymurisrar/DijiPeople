// RUN-008: what does the RSC prefetch of a redirecting route answer? (WebKit "due to access control checks"). Local only; talks to the web server on 127.0.0.1 with a Host header.
import http from 'node:http';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const login = await (await fetch(env.QA_API_URL + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'X-DijiPeople-App': 'web' }, body: JSON.stringify({ email: 'a-employee@qa.dijipeople.test', password: env.QA_PASSWORD, tenantSlug: 'qa-prov-a' }) })).json();
const tok = login.accessToken ?? login.tokens?.accessToken;
const get = (path, headers = {}) => new Promise((res) => { const r = http.request({ host: '127.0.0.1', port: 3314, path, method: 'GET', headers: { Host: 'qa-prov-a.localhost:3314', Cookie: `web_access_token=${tok}`, ...headers } }, (x) => { x.resume(); x.on('end', () => res({ status: x.statusCode, location: x.headers.location, type: x.headers['content-type'] })); }); r.end(); });
for (const p of ['/my-profile', '/approvals', '/leaves']) {
  console.log(p.padEnd(12), 'document:', JSON.stringify(await get(p)));
  console.log(p.padEnd(12), 'RSC     :', JSON.stringify(await get(p + '?_rsc=tXyZJ52UQVBCVsD3', { RSC: '1', 'Next-Router-Prefetch': '1', 'Next-Url': '/leaves' })));
}
