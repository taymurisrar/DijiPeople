// Screenshots pages and dumps visible buttons/labels/headings. Usage: node explore.mjs ROLE /path ...
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const [role, ...paths] = process.argv.slice(2);
const dir = new URL('../../golive-results/explore/', import.meta.url);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 140)));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url().replace(env.QA_API_URL, '')}`.slice(0, 140)));
const u = (p) => env.QA_WEB_URL.includes(env.QA_TENANT_SLUG + '.') ? env.QA_WEB_URL + p : `${env.QA_WEB_URL}${p}?tenant=${env.QA_TENANT_SLUG}`;
await page.goto(u('/login'));
await page.waitForLoadState('networkidle').catch(() => {});
await page.getByLabel(/email/i).first().fill(env[`QA_${role}_EMAIL`]);
await page.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
await page.getByRole('button', { name: /sign in|log in/i }).first().click();
await page.waitForURL((x) => !/\/login/.test(x.pathname), { timeout: 60000 });
for (const p of paths) {
  errors.length = 0;
  await page.goto(u(p), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const name = p.replace(/[^a-z0-9]+/gi, '_');
  await page.screenshot({ path: fileURLToPath(new URL(`${role}${name}.png`, dir)), fullPage: false });
  const info = await page.evaluate(() => ({
    h: [...document.querySelectorAll('h1,h2')].slice(0, 6).map((e) => e.textContent.trim()),
    buttons: [...new Set([...document.querySelectorAll('button,a[role=button]')].map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim()).filter(Boolean))].slice(0, 30),
    labels: [...document.querySelectorAll('label')].map((e) => e.textContent.trim()).slice(0, 40),
  }));
  console.log('\n## ' + p, JSON.stringify(info), '\nERRORS:', JSON.stringify(errors.slice(0, 6)));
}
await browser.close();
