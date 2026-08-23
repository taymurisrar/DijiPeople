/**
 * Layout stability under a realistic connection.
 *
 * On localhost every asset arrives in a millisecond, so a page that reflows
 * when its webfont lands still scores CLS 0 — the shift happens before there
 * is anything on screen to shift. Throttling to a slow connection is what makes
 * the difference visible, and it is the condition the score is defined for.
 *
 * Fast 3G numbers, from Chrome's own presets: 1.6 Mbit down, 750 kbit up,
 * 150 ms RTT.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3010';
const ROUTES = (process.argv[3] ?? '/,/plans,/contact,/subscribe').split(',');
const RUNS = Number(process.env.CLS_RUNS ?? 3);

const browser = await chromium.launch();

console.log(`\n${BASE} — CLS over ${RUNS} throttled loads (Fast 3G)\n`);
console.log('route'.padEnd(16) + 'samples'.padEnd(30) + 'median   verdict');

for (const route of ROUTES) {
  const samples = [];

  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });

    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto(BASE + route, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(3000);
    samples.push(await page.evaluate(() => window.__cls));
    await context.close();
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const verdict = median > 0.25 ? 'POOR' : median > 0.1 ? 'needs work' : 'good';

  console.log(
    route.padEnd(16) +
      samples.map((s) => s.toFixed(3)).join(' ').padEnd(30) +
      median.toFixed(3).padStart(6) + '   ' + verdict,
  );
}

await browser.close();
