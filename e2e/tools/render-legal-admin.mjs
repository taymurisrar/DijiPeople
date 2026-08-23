/**
 * Load the Platform Admin legal screen as a browser does, signed in.
 *
 * Typechecking a page proves it compiles. It does not prove the screen renders,
 * that its data arrives, or that its controls are enabled for the right reasons
 * — and a settings screen that looks fine and refuses on click is exactly what
 * this feature exists to replace.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const ADMIN = process.argv[2] ?? 'http://localhost:3012';

function envValue(key) {
  const file = fs.readFileSync(new URL('../../services/api/.env', import.meta.url), 'utf8');
  return file.match(new RegExp(`^${key}="?([^"\\n\\r]*)"?`, 'm'))?.[1] ?? null;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));

await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle', timeout: 90_000 });
await page.getByLabel(/email/i).first().fill(envValue('BOOTSTRAP_ADMIN_EMAIL'));
await page.getByLabel(/password/i).first().fill(envValue('BOOTSTRAP_ADMIN_PASSWORD'));
await page.getByRole('button', { name: /sign in|log in/i }).first().click();
await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 });
console.log('signed in →', page.url());

await page.goto(`${ADMIN}/settings/legal`, { waitUntil: 'networkidle', timeout: 90_000 });
console.log('legal page →', page.url());

const view = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')].map((b) =>
    `${(b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 44)}${b.disabled ? ' [disabled]' : ''}`,
  );
  return {
    heading: document.querySelector('h1, h2')?.textContent?.trim(),
    summary: (document.querySelector('main')?.innerText ?? '').slice(0, 220),
    buttons: buttons.filter(Boolean).slice(0, 16),
  };
});

console.log('heading :', view.heading);
console.log('summary :', view.summary.split('\n').filter(Boolean).slice(0, 4).join(' | '));
console.log('controls:', view.buttons.length);

// Open a document and confirm the editor loads its text and its blockers.
const doc = page.getByRole('button', { name: /Terms of Service/i }).first();
if (await doc.count()) {
  await doc.click();
  await page.waitForTimeout(2500);
  const editor = await page.evaluate(() => {
    const textarea = document.querySelector('textarea');
    const main = document.querySelector('main')?.innerText ?? '';
    return {
      chars: textarea?.value.length ?? 0,
      disabled: textarea?.disabled ?? null,
      blockers: main.includes('Not publishable yet'),
      publishDisabled: [...document.querySelectorAll('button')]
        .find((b) => /^Publish$/i.test((b.innerText || '').trim()))?.disabled ?? null,
    };
  });
  console.log('\nopened a document:');
  console.log('  markdown loaded :', editor.chars, 'chars');
  console.log('  textarea locked :', editor.disabled);
  console.log('  blockers shown  :', editor.blockers);
  console.log('  publish disabled:', editor.publishDisabled);
}

console.log('\nconsole errors:', errors.length ? errors : 'none');
await browser.close();
