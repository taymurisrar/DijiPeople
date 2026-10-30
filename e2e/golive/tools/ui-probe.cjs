// Opens a page with a cached session and prints console errors, failed requests and a screenshot path. Usage: node ui-probe.cjs <A|B> <ROLE> /path [shot-name]
const { chromium } = require('@playwright/test'); const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.qa.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const [t, role, path, shot = 'ui-probe'] = process.argv.slice(2);
const slug = t === 'A' ? env.QA_TENANT_A_SLUG : t === 'B' ? env.QA_TENANT_B_SLUG : env.QA_TENANT_SLUG;
(async () => {
  const b = await chromium.launch(); const c = await b.newContext({ storageState: `e2e/golive-results/.auth/${t === 'S' ? '' : t + '-'}${role}.json`, viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
  const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200))); p.on('response', (r) => r.status() >= 400 && errs.push(r.status() + ' ' + r.url().slice(0, 120)));
  await p.goto(`http://${slug}.localhost:3012${path}`); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(2000);
  await p.screenshot({ path: `e2e/golive-results/explore/${shot}.png` });
  console.log(JSON.stringify(errs, null, 1)); await b.close();
})();
