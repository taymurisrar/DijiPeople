// Probe (not part of the suite): what does WebKit do with the RSC prefetches that raise "access control checks"? Usage (from e2e/): node golive/tools/webkit-rsc-probe.cjs <https-url> <storageState>
const { webkit } = require('@playwright/test');
(async () => {
  const [url, state] = process.argv.slice(2);
  const b = await webkit.launch(); const ctx = await b.newContext({ ignoreHTTPSErrors: true, storageState: state }); const page = await ctx.newPage();
  const rows = [];
  page.on('requestfailed', (r) => { if (/_rsc=/.test(r.url())) rows.push(`FAILED ${r.url().replace(/_rsc=.*/, '_rsc=*')} :: ${r.failure()?.errorText} redirectedFrom=${r.redirectedFrom()?.url().replace(/_rsc=.*/, '_rsc=*') ?? '-'}`); });
  page.on('response', async (r) => { if (/_rsc=/.test(r.url())) rows.push(`${r.status()} ${r.url().replace(/_rsc=.*/, '_rsc=*')} location=${r.headers()['location'] ?? '-'} acao=${r.headers()['access-control-allow-origin'] ?? '-'} redirectedFrom=${r.request().redirectedFrom()?.url().replace(/_rsc=.*/, '_rsc=*') ?? '-'}`); });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).replace(/_rsc=[^ ]*/, '_rsc=*').slice(0, 140)));
  await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(6000);
  console.log(rows.join('\n')); console.log('PAGEERRORS', errs.length); console.log(errs.join('\n'));
  await b.close();
})();
