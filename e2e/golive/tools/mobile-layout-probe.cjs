// Probe (not part of the suite): width of the main content column of several Settings pages on a Pixel 7 profile. Usage (from e2e/): node golive/tools/mobile-layout-probe.cjs <baseUrl> <storageState> <path>...
const { chromium, devices } = require('@playwright/test');
(async () => {
  const [base, state, ...paths] = process.argv.slice(2);
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], storageState: state }); const page = await ctx.newPage();
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => { const h = [...document.querySelectorAll('h2')].map(e => { const b = e.getBoundingClientRect(); return `${e.textContent.trim().slice(0, 22)} x=${Math.round(b.x)} w=${Math.round(b.width)}`; }); return { viewport: innerWidth, docScrollWidth: document.documentElement.scrollWidth, h2: h.slice(0, 4) }; });
    console.log(p.padEnd(32), JSON.stringify(r));
  }
  await b.close();
})();
