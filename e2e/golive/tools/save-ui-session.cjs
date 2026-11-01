// Signs in through the REAL login form of a tenant and stores the browser session for Playwright MCP (MCP can only read files inside the primary checkout).
// Reads the QA password from .env.qa.local inside this process, so it never appears in a tool call. Usage (from e2e/): node golive/tools/save-ui-session.cjs <tenantUrl> <email> <outFile>
const { chromium } = require('@playwright/test'); const fs = require('fs'); const path = require('path');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '..', '..', '.env.qa.local'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
(async () => {
  const [url, email, out] = process.argv.slice(2);
  const b = await chromium.launch(); const page = await (await b.newContext()).newPage();
  await page.goto(url + '/login', { waitUntil: 'networkidle' });
  await page.getByLabel(/email/i).first().fill(email); await page.getByLabel(/password/i).first().fill(env.QA_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).first().click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 45000 });
  await page.context().storageState({ path: out }); console.log('saved', out, 'at', page.url());
  await b.close();
})();
