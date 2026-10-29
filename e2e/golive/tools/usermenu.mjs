// Dumps the items in the profile menu so the sign-out selector is grounded in the real UI.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto(env.QA_WEB_URL + '/login');
await p.waitForLoadState('networkidle').catch(() => {});
await p.getByLabel(/email/i).first().fill(env.QA_ADMIN_EMAIL);
await p.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
await p.getByRole('button', { name: /sign in|log in/i }).first().click();
await p.waitForURL((u) => !/login/.test(u.pathname));
await p.getByRole('button', { name: /demo system admin/i }).first().click();
await p.waitForTimeout(500);
console.log(p.url(), await p.evaluate(() => [...document.querySelectorAll('button,a,[role=menuitem]')].map((e) => (e.textContent||'').trim()).filter((s) => /sign|log|out|profile|account|security|password/i.test(s))));
await b.close();
