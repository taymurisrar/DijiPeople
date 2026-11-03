// RUN-008: records every _rsc request/response (status, Location, failure) while an employee dwells on /leaves in WebKit over the TLS front. Local only.
const fs = require('fs'); const { webkit } = require('@playwright/test');
const env = Object.fromEntries(fs.readFileSync(__dirname + '/../../../.env.qa.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
(async () => {
  const b = await webkit.launch(); const ctx = await b.newContext({ ignoreHTTPSErrors: true }); const p = await ctx.newPage();
  const log = [];
  p.on('request', (r) => { if (/_rsc=/.test(r.url())) log.push(`REQ  ${r.url().replace(/^https?:\/\/[^/]+/, '')} prefetch=${r.headers()['next-router-prefetch'] || ''}`); });
  p.on('response', (r) => { if (/_rsc=/.test(r.url())) log.push(`RESP ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} location=${r.headers()['location'] || ''}`); });
  p.on('requestfailed', (r) => { if (/_rsc=/.test(r.url())) log.push(`FAIL ${r.url().replace(/^https?:\/\/[^/]+/, '')} ${r.failure()?.errorText}`); });
  p.on('pageerror', (e) => log.push(`PAGEERROR ${e.message.slice(0, 160)}`));
  const base = 'https://qa-prov-a.localhost:3744';
  await p.goto(base + '/login'); await p.waitForLoadState('networkidle').catch(() => undefined); await p.getByLabel(/email/i).first().fill('a-employee@qa.dijipeople.test'); await p.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
  await p.getByRole('button', { name: /sign in|log in/i }).first().click(); await p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 45000 }).catch(async (e) => { console.log('LOGIN STUCK', p.url(), (await p.locator('body').innerText()).slice(0, 300).split(String.fromCharCode(10)).join(' | ')); throw e; });
  log.length = 0; await p.goto(base + '/leaves'); await p.waitForTimeout(12000);
  console.log(log.join('\n')); await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
