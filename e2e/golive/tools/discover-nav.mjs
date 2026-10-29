// Walks the tenant sidebar as a given role and records every link plus the HTTP/redirect outcome.
// Usage: node e2e/golive/tools/discover-nav.mjs [role]   (role: ADMIN|HR|MANAGER|EMPLOYEE ...)
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const role = (process.argv[2] ?? 'ADMIN').toUpperCase();
const email = env[`QA_${role}_EMAIL`];
const web = env.QA_WEB_URL;
const url = (p) => `${web}${p}${p.includes('?') ? '&' : '?'}tenant=${env.QA_TENANT_SLUG}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(url('/login'), { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.getByLabel(/email/i).first().fill(email);
await page.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
await page.getByRole('button', { name: /sign in|log in/i }).first().click();
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 });
await page.waitForLoadState('networkidle').catch(() => {});
console.log('landed', page.url());

const links = await page.$$eval('a[href^="/"]', (as) =>
  [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => h && !h.startsWith('/api')),
);
const out = [];
for (const href of links) {
  const r = await page.goto(url(href.split('?')[0]), { waitUntil: 'domcontentloaded' }).catch(() => null);
  await page.waitForTimeout(400);
  out.push({ href, status: r?.status() ?? 0, finalPath: new URL(page.url()).pathname, title: (await page.title()).slice(0, 60) });
}
mkdirSync(new URL('../../golive-results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../../golive-results/nav-${role}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.table(out);
await browser.close();
