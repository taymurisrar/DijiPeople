// Dumps the DOM around a label in a tenant page, using a cached QA session (no login). Usage: node dom-probe.mjs <A|B> <OWNER|...> /path "label text"
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const [t, role, path, label] = process.argv.slice(2);
const slug = t === 'A' ? env.QA_TENANT_A_SLUG : env.QA_TENANT_B_SLUG;
const port = new URL(env.QA_WEB_URL).port;
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: new URL(`../../golive-results/.auth/${t}-${role}.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ') });
const p = await ctx.newPage();
await p.goto(`http://${slug}.localhost:${port}${path}`); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1000);
const html = await p.evaluate((l) => { const e = [...document.querySelectorAll('label')].find((x) => x.textContent.includes(l)); return e ? (e.closest('div')?.parentElement ?? e).outerHTML.slice(0, 1500) : 'label not found'; }, label);
console.log(html);
await b.close();
