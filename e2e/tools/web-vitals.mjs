/**
 * Speed and weight of the public pages, measured in a real browser.
 *
 * Run this against a **production build**. A `next dev` server compiles on
 * first request and ships an unminified bundle, so numbers taken from it
 * describe the dev server rather than the product — quoting them as
 * performance results would be worse than not measuring.
 *
 * What is collected, and why each one:
 *   TTFB   — how long the server thought before answering. Separates a slow
 *            backend from a heavy page.
 *   FCP    — when the visitor first sees anything.
 *   LCP    — when the main content is there. The Core Web Vitals threshold is
 *            2500 ms good / 4000 ms poor.
 *   CLS    — how much the layout moved under them. 0.1 good / 0.25 poor.
 *   bytes  — transferred JS and CSS, which is what a phone on mobile data pays.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'https://www.dijipeople.com';
const ROUTES = ['/', '/plans', '/features', '/about', '/contact', '/partners', '/request-demo', '/subscribe'];
const RUNS = Number(process.env.PERF_RUNS ?? 2);

const browser = await chromium.launch();
const rows = [];

for (const route of ROUTES) {
  const samples = [];

  for (let run = 0; run < RUNS; run++) {
    // A fresh context each run: a warm HTTP cache would measure the second
    // visit, and the first visit is the one that decides whether someone stays.
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();

    const transferred = { js: 0, css: 0, img: 0, other: 0, requests: 0 };
    page.on('response', async (response) => {
      transferred.requests++;
      const url = response.url();
      let size = 0;
      try { size = Number((await response.headerValue('content-length')) ?? 0); } catch {}
      if (/\.js(\?|$)/.test(url)) transferred.js += size;
      else if (/\.css(\?|$)/.test(url)) transferred.css += size;
      else if (/\.(png|jpe?g|svg|webp|avif|gif)(\?|$)/.test(url)) transferred.img += size;
      else transferred.other += size;
    });

    await page.goto(BASE + route, { waitUntil: 'load', timeout: 90_000 });

    /*
     * LCP and CLS are only final once the page settles, and both are reported
     * through PerformanceObserver rather than a synchronous API. Two seconds of
     * quiet is enough for a marketing page and keeps the sweep tractable.
     */
    const vitals = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let lcp = 0;
          let cls = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) lcp = entry.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) cls += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });

          setTimeout(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const fcp = performance
              .getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
            resolve({
              ttfb: nav ? nav.responseStart - nav.requestStart : 0,
              domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
              load: nav ? nav.loadEventEnd : 0,
              fcp,
              lcp,
              cls,
            });
          }, 2000);
        }),
    );

    samples.push({ ...vitals, ...transferred });
    await context.close();
  }

  // Median rather than mean: one slow cold start should not define the page.
  const median = (key) => {
    const values = samples.map((s) => s[key]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };

  rows.push({
    route,
    ttfb: Math.round(median('ttfb')),
    fcp: Math.round(median('fcp')),
    lcp: Math.round(median('lcp')),
    cls: Number(median('cls').toFixed(3)),
    load: Math.round(median('load')),
    jsKB: Math.round(median('js') / 1024),
    cssKB: Math.round(median('css') / 1024),
    reqs: median('requests'),
  });
}

const verdict = (row) => {
  const bad = [];
  if (row.lcp > 4000) bad.push('LCP poor');
  else if (row.lcp > 2500) bad.push('LCP needs work');
  if (row.cls > 0.25) bad.push('CLS poor');
  else if (row.cls > 0.1) bad.push('CLS needs work');
  if (row.ttfb > 800) bad.push('TTFB slow');
  return bad.length ? bad.join(', ') : 'good';
};

console.log(`\nTarget: ${BASE}   (median of ${RUNS} cold loads)\n`);
console.log(
  'route'.padEnd(16) + 'TTFB'.padStart(7) + 'FCP'.padStart(8) + 'LCP'.padStart(8) +
  'CLS'.padStart(8) + 'load'.padStart(8) + 'JS kB'.padStart(8) + 'CSS kB'.padStart(8) +
  'reqs'.padStart(6) + '   verdict',
);
for (const row of rows) {
  console.log(
    row.route.padEnd(16) +
      `${row.ttfb}ms`.padStart(7) +
      `${row.fcp}ms`.padStart(8) +
      `${row.lcp}ms`.padStart(8) +
      `${row.cls}`.padStart(8) +
      `${row.load}ms`.padStart(8) +
      `${row.jsKB}`.padStart(8) +
      `${row.cssKB}`.padStart(8) +
      `${row.reqs}`.padStart(6) +
      '   ' + verdict(row),
  );
}

await browser.close();
