/**
 * Accessibility of the public pages, as a browser and an axe scan see them.
 *
 * Two questions this answers that source reading cannot: whether every control
 * has an accessible name a screen reader would announce, and what axe finds on
 * each page at its serious/critical levels.
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.argv[2] ?? 'http://localhost:3010';
const ROUTES = ['/', '/plans', '/features', '/about', '/contact', '/partners', '/request-demo', '/subscribe'];

const browser = await chromium.launch();
let totalViolations = 0;

for (const route of ROUTES) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60_000 });

  /*
   * The accessible name, computed the way assistive tech computes it: a
   * wrapping or `for`-associated <label>, else aria-label, else
   * aria-labelledby. `name` and `placeholder` are deliberately NOT accepted —
   * a placeholder disappears as soon as someone types.
   */
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea')]
      .filter((c) => c.type !== 'hidden' && !!(c.offsetWidth || c.offsetHeight))
      .filter((c) => {
        if (c.closest('label')) return false;
        const id = c.getAttribute('id');
        if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return false;
        if (c.getAttribute('aria-label')?.trim()) return false;
        const labelledBy = c.getAttribute('aria-labelledby');
        if (labelledBy && labelledBy.split(/\s+/).some((x) => document.getElementById(x))) return false;
        return true;
      })
      .map((c) => `${c.tagName.toLowerCase()}[name=${c.getAttribute('name') ?? '?'}]`),
  );

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  totalViolations += serious.length;

  console.log(`\n=== ${route}`);
  console.log(`   controls with no accessible name: ${unnamed.length ? unnamed.join(', ') : 'none'}`);
  if (!serious.length) {
    console.log('   axe serious/critical: none');
  } else {
    for (const v of serious) {
      console.log(`   axe ${v.impact.toUpperCase()} — ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
      for (const node of v.nodes.slice(0, 2)) {
        console.log(`        ${node.target.join(' ')} :: ${String(node.html).replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
  }
  await context.close();
}

console.log(`\nTOTAL serious/critical axe violations across ${ROUTES.length} pages: ${totalViolations}`);
await browser.close();
