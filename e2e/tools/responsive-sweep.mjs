/**
 * How the public pages behave at the widths people actually use.
 *
 * Three things are checked, and each corresponds to a defect that is invisible
 * on a desktop monitor:
 *
 *   horizontal scroll  — content wider than the viewport. The page can be
 *                        panned sideways, which on a phone feels broken and
 *                        hides whatever sits off-screen.
 *   tap targets        — interactive elements below WCAG 2.5.8's 24×24 CSS px.
 *                        Undersized links in a footer are the usual offender.
 *   overflowing nodes  — the specific elements sticking out, so the finding is
 *                        actionable rather than a number.
 *
 * ## Two flags that are not defects, checked on 2026-08-23
 *
 * The sweep still reports these; both were investigated and neither is a
 * violation. Recorded here so the next run does not re-litigate them.
 *
 * - **`a "Skip to main content"` at 32×16.** Measured while visually hidden. On
 *   focus it becomes 137×20 — still four pixels under 24, but it is an overlay
 *   with nothing near it, so WCAG 2.5.8's *spacing* exception applies: a 24px
 *   circle centred on it intersects no other target.
 * - **`a "Compare all plans in detail"` at 175×19** on `/`. `display: inline`
 *   inside `<p class="text-sm text-muted">`, mid-sentence. That is 2.5.8's
 *   *inline* exception — its height is constrained by the line-height of the
 *   text around it, which is exactly the case the exception exists for.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3010';
const ROUTES = (process.argv[3] ?? '/,/plans,/features,/about,/contact,/partners,/request-demo,/subscribe').split(',');

/** Real device widths, not round numbers. */
const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPad', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
];

const browser = await chromium.launch();
let problems = 0;

for (const viewport of VIEWPORTS) {
  console.log(`\n=== ${viewport.name} (${viewport.width}px) ===`);

  for (const route of ROUTES) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      isMobile: viewport.width < 768,
      hasTouch: viewport.width < 768,
    });
    const page = await context.newPage();
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60_000 });

    const report = await page.evaluate((width) => {
      const doc = document.documentElement;
      const overflowing = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          // Ignore off-screen-by-design elements (closed menus, sr-only).
          if (rect.width === 0 || rect.height === 0) return false;
          return rect.right > width + 1;
        })
        .slice(0, 4)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} → ${Math.round(rect.right)}px`;
        });

      /*
       * The target is what a finger can hit, not the element's own box.
       *
       * A checkbox styled as a 16×16 square inside a `<label>` has the label's
       * whole area as its hit region — measuring the input alone reports a
       * violation that does not exist, and a sweep that cries wolf gets
       * ignored. Same for a visually-hidden skip link, which is 32×16 until it
       * takes focus and then is not.
       */
      const effectiveRect = (el) => {
        const wrapping = el.closest('label');
        return (wrapping ?? el).getBoundingClientRect();
      };

      const smallTargets = Array.from(
        document.querySelectorAll('a, button, input, select, textarea'),
      )
        .filter((el) => {
          if (el.type === 'hidden') return false;
          const own = el.getBoundingClientRect();
          if (own.width === 0 || own.height === 0) return false;
          const rect = effectiveRect(el);
          return rect.height < 24 || rect.width < 24;
        })
        .slice(0, 5)
        .map((el) => {
          const rect = effectiveRect(el);
          const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24);
          return `${el.tagName.toLowerCase()} "${label}" ${Math.round(rect.width)}×${Math.round(rect.height)}`;
        });

      return {
        scrollWidth: doc.scrollWidth,
        overflowing,
        smallTargets,
      };
    }, viewport.width);

    const scrolls = report.scrollWidth > viewport.width + 1;
    const bad = scrolls || report.overflowing.length > 0 || report.smallTargets.length > 0;
    if (bad) problems++;

    console.log(
      `  ${route.padEnd(15)} ${scrolls ? `H-SCROLL ${report.scrollWidth}px` : 'no h-scroll'}` +
        `  targets<24px: ${report.smallTargets.length}`,
    );
    for (const node of report.overflowing) console.log(`      overflows: ${node}`);
    for (const target of report.smallTargets) console.log(`      small: ${target}`);

    await context.close();
  }
}

console.log(`\n${problems === 0 ? 'No responsive problems found.' : `${problems} route/viewport combination(s) with problems.`}`);
await browser.close();
