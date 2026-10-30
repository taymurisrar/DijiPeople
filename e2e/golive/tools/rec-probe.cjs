const { chromium } = require('@playwright/test'); const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.qa.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const T = JSON.parse(fs.readFileSync('e2e/golive-results/.auth/api-tokens.json', 'utf8'));
(async () => {
  const list = await (await fetch(env.QA_API_URL + '/api/employees?pageSize=5', { headers: { authorization: 'Bearer ' + T['A/OWNER'].token, 'X-DijiPeople-App': 'web' } })).json();
  const id = list.items[0].id;
  const b = await chromium.launch(); const c = await b.newContext({ storageState: 'e2e/golive-results/.auth/A-OWNER.json', viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
  await p.goto(`http://qa-prov-a.localhost:3012/employees/${id}`); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1500);
  console.log(JSON.stringify(await p.evaluate(() => ({
    tabs: [...document.querySelectorAll('[role=tab]')].map((e) => e.textContent.trim()),
    textTabs: [...document.querySelectorAll('button,a')].map((e) => e.textContent.trim()).filter((t) => /Summary|Attendance|Timesheets|Compensation|Payslips|Documents|Leave History|Project Alloc/.test(t)).slice(0, 20),
    buttons: [...new Set([...document.querySelectorAll('button')].map((e) => e.textContent.trim()).filter(Boolean))].slice(0, 25),
    fields: [...document.querySelectorAll('[data-runtime-field]')].map((e) => e.getAttribute('data-runtime-field')).slice(0, 15),
  }))));
  await p.screenshot({ path: 'e2e/golive-results/explore/emp-record.png' });
  await p.goto('http://qa-prov-a.localhost:3012/employees'); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(1000);
  const names = async () => (await p.locator('tbody tr').evaluateAll((rs) => rs.map((r) => r.innerText.split('\n')[0]))).join(' | ');
  console.log('before', await names());
  await p.getByRole('button', { name: /sort full name/i }).click(); await p.waitForTimeout(3000); console.log('click1', await names(), p.url()); await p.screenshot({ path: 'e2e/golive-results/explore/emp-sort.png' }); await b.close(); return;
  await p.getByRole('button', { name: /sort full name/i }).click(); await p.waitForTimeout(2500); console.log('click2', await names());
  await b.close();
})();
