// Mobile (Pixel 7) screenshot of a tenant-A page with a cached owner session. Usage: node mobile-shot.cjs /path out.png
const { chromium, devices } = require('@playwright/test');
(async () => {
  const b = await chromium.launch(); const c = await b.newContext({ ...devices['Pixel 7'], storageState: 'e2e/golive-results/.auth/A-OWNER.json' }); const p = await c.newPage();
  await p.goto('http://qa-prov-a.localhost:3012' + process.argv[2]); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(2000);
  console.log(JSON.stringify(await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))));
  await p.screenshot({ path: process.argv[3] }); await b.close();
})();
