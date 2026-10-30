// Opens a page, clicks a button by accessible name, then dumps the resulting dialog/form controls and screenshots it.
// Usage: node click-explore.mjs ROLE /path "Button name" [outfile-stem]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const [role, path, button, stem = 'click'] = process.argv.slice(2);
const dir = new URL('../../golive-results/explore/', import.meta.url); mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(env.QA_WEB_URL + '/login'); await p.waitForLoadState('networkidle').catch(() => {});
await p.getByLabel(/email/i).first().fill(env[`QA_${role}_EMAIL`]); await p.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
await p.getByRole('button', { name: /sign in|log in/i }).first().click();
await p.waitForURL((u) => !/login/.test(u.pathname));
await p.goto(env.QA_WEB_URL + path); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(800);
const loc = p.getByRole('button', { name: button, exact: false }).or(p.getByRole('link', { name: button })).first();
console.log('target count', await loc.count());
await loc.click(); await p.waitForTimeout(1500); await p.waitForLoadState('networkidle').catch(() => {});
console.log('url', p.url());
await p.screenshot({ path: fileURLToPath(new URL(`${stem}.png`, dir)) });
console.log(JSON.stringify(await p.evaluate(() => ({
  dialogs: [...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText.slice(0, 400)),
  labels: [...document.querySelectorAll('label')].map((e) => e.textContent.trim()).slice(0, 40),
  buttons: [...new Set([...document.querySelectorAll('button')].map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim()).filter(Boolean))].slice(0, 40),
})), null, 1));
await b.close();
