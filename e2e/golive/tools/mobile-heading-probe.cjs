// Probe (not part of the suite): which headings does the Data Management page expose on a Pixel 7 profile for a given stored session? Usage (from e2e/): node golive/tools/mobile-heading-probe.cjs <url> <storageState>
const { chromium, devices } = require('@playwright/test');
(async () => {
  const [url, state] = process.argv.slice(2);
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], storageState: state }); const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(4000);
  console.log('url', page.url());
  console.log(JSON.stringify(await page.locator('h1,h2,h3').evaluateAll(els => els.map(e => ({ t: e.tagName, text: e.textContent.trim().slice(0, 36), shown: !!(e.offsetWidth || e.offsetHeight) })))));
  console.log('a11y of h2:', JSON.stringify(await page.locator('h2').evaluateAll(els => els.map(e => ({ text: e.textContent.trim().slice(0, 24), ariaHiddenAncestor: !!e.closest('[aria-hidden=true]'), inertAncestor: !!e.closest('[inert]'), role: e.getAttribute('role') })))));
  console.log('getByRole count:', await page.getByRole('heading', { name: /import & export/i }).count(), 'visible:', await page.getByRole('heading', { name: /import & export/i }).locator('visible=true').count());
  const h = page.getByRole('heading', { name: /import & export/i }).first();
  console.log('playwright isVisible:', await h.isVisible(), 'box:', JSON.stringify(await h.boundingBox()), 'style:', JSON.stringify(await h.evaluate(e => { const c = getComputedStyle(e); return { visibility: c.visibility, opacity: c.opacity, display: c.display, h: c.height, overflow: c.overflow, parentOverflow: getComputedStyle(e.parentElement).overflow, parentH: getComputedStyle(e.parentElement).height }; })));
  console.log('body text has Import & Export:', /import & export/i.test(await page.locator('main, body').first().innerText()));
  await b.close();
})();
