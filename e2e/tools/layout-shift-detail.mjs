/**
 * Which elements move, and by how much.
 *
 * A CLS score says the page is unstable; it does not say what jumped. Every
 * `layout-shift` entry carries `sources`, each naming the node that moved and
 * its rectangle before and after — which turns "CLS 0.313" into a specific
 * element to fix.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://www.dijipeople.com';
const ROUTE = process.argv[3] ?? '/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__shifts.push({
        value: entry.value,
        time: Math.round(entry.startTime),
        sources: (entry.sources ?? []).map((source) => ({
          tag: source.node?.tagName ?? '?',
          cls: (source.node?.className ?? '').toString().slice(0, 70),
          text: (source.node?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          from: source.previousRect
            ? `${Math.round(source.previousRect.y)},${Math.round(source.previousRect.height)}`
            : null,
          to: source.currentRect
            ? `${Math.round(source.currentRect.y)},${Math.round(source.currentRect.height)}`
            : null,
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
});

await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 90_000 });
await page.waitForTimeout(4000);

const shifts = await page.evaluate(() => window.__shifts);
const total = shifts.reduce((sum, s) => sum + s.value, 0);

console.log(`\n${BASE}${ROUTE}`);
console.log(`total CLS: ${total.toFixed(3)} across ${shifts.length} shift(s)\n`);

for (const shift of shifts.sort((a, b) => b.value - a.value).slice(0, 8)) {
  console.log(`  ${shift.value.toFixed(4)} at ${shift.time}ms`);
  for (const source of shift.sources) {
    console.log(`      <${source.tag}> y,h ${source.from} -> ${source.to}`);
    if (source.cls) console.log(`         class: ${source.cls}`);
    if (source.text) console.log(`         text : "${source.text}"`);
  }
}

// Fonts are the usual cause of a late reflow on a text-heavy marketing page.
const fonts = await page.evaluate(() =>
  [...document.fonts].map((f) => `${f.family} ${f.style} ${f.weight} ${f.status}`),
);
console.log('\nfonts:', fonts.length ? [...new Set(fonts)].join(' | ') : 'none');

await browser.close();
