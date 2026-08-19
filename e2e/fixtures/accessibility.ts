import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Accessibility auditing, shared by every surface.
 *
 * This repository had no accessibility tooling of any kind before this file.
 * `AGENTS.md` requires that controls are labelled, dialogs are focus-trapped
 * and escapable, tables are keyboard-navigable and meaning is never carried by
 * colour alone — all of which were conventions nothing checked.
 *
 * `@axe-core/playwright` was added deliberately rather than hand-rolling
 * assertions. Structural checks written by hand can say a heading exists; they
 * cannot say whether its contrast ratio passes, whether an ARIA role is valid
 * for its element, or whether a landmark is duplicated. Those are the rules
 * that actually catch defects, and axe is the standard implementation of them.
 */

/** The rule sets a product screen is expected to satisfy. */
const STANDARD_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export type AxeViolation = {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
};

/**
 * Audit the current page and return violations in a form worth reading.
 *
 * The raw axe result is large and mostly noise at the point of failure; what a
 * person needs is the rule, how bad it is, and which elements tripped it.
 */
export async function auditPage(
  page: Page,
  options: { disableRules?: string[] } = {},
): Promise<AxeViolation[]> {
  let builder = new AxeBuilder({ page }).withTags(STANDARD_TAGS);
  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }

  const result = await builder.analyze();

  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    nodes: violation.nodes
      .map((node) => node.target.join(' '))
      .slice(0, 5),
  }));
}

/**
 * Only the violations serious enough to block.
 *
 * A first accessibility run against a codebase that has never had one will
 * surface a long tail of minor and moderate findings. Failing a test on all of
 * them at once produces a red suite nobody can act on, which trains people to
 * ignore it — the failure mode the QA context warns about. Critical and serious
 * violations gate; the rest are reported, recorded as backlog items and burned
 * down deliberately.
 */
export function blocking(violations: AxeViolation[]): AxeViolation[] {
  return violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
}

/** A readable one-line-per-violation summary for a failure message. */
export function describeViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return 'none';
  return violations
    .map(
      (violation) =>
        `${violation.impact.toUpperCase()} ${violation.id}: ${violation.help} [${violation.nodes.join(', ')}]`,
    )
    .join('\n');
}

/**
 * Does the page body scroll sideways?
 *
 * The single most common responsive defect, and the one that makes a screen
 * unusable rather than merely ugly: when the body scrolls horizontally the
 * navigation shell slides away with it. Wide content is supposed to scroll
 * inside its own container instead.
 *
 * Checked as a layout property rather than against a screenshot baseline.
 * Baselines generated on one operating system do not match another's renderer,
 * so they cannot gate CI; this assertion is identical everywhere.
 */
export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
}

/** The widths worth checking: phone, tablet, and the most common laptop. */
export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
] as const;
