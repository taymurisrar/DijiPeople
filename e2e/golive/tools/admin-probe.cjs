// RUN-008 exploration of the admin console price publish UI. Local only. Usage: node admin-probe.cjs <planId>
const fs = require('fs');
const { chromium } = require('@playwright/test');
const env = Object.fromEntries(fs.readFileSync(__dirname + '/../../../.env.qa.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(env.QA_ADMIN_URL + '/login');
  await p.getByRole('textbox', { name: 'Email' }).fill(env.QA_PLATFORM_EMAIL);
  await p.getByRole('textbox', { name: 'Password' }).fill(env.QA_PLATFORM_PASSWORD);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 30000 });
  await p.goto(env.QA_ADMIN_URL + '/plans');
  await p.waitForLoadState('networkidle');
  console.log('LIST TEXT', (await p.locator('main').innerText()).slice(0, 600).replace(/\n+/g, ' | '));
  await p.goto(env.QA_ADMIN_URL + '/plans/' + process.argv[2]);
  await p.waitForLoadState('networkidle');
  console.log('DETAIL URL', p.url());
  const btns = await p.$$eval('button', (bs) => bs.map((x) => (x.getAttribute('aria-label') || x.getAttribute('title') || x.textContent || '').trim().slice(0, 50) + (x.disabled ? ' [disabled]' : '')));
  console.log(btns.join('\n'));
  await p.screenshot({ path: 'golive-results/run008-admin-plan.png', fullPage: true });
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
