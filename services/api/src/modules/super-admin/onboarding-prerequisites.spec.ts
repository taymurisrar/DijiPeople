import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVICE = join(__dirname, 'platform-lifecycle.service.ts');
const source = readFileSync(SERVICE, 'utf8');

/**
 * BUG-1547 — the prerequisite message stated the inverse of the truth.
 *
 * With industry and company size *not* selected, it read "Onboarding
 * prerequisites are not complete: Industry is selected, Company size is
 * selected". The header contradicted the list beneath it, and the list
 * announced that the missing things were present.
 *
 * The evaluation was never wrong — `missingItems` filters `!passed` correctly.
 * The labels are phrased positively because they sit beside a tick or a cross
 * in the checklist, and the failure message reused them as a list of what was
 * absent.
 */
describe('BUG-1547 — the failure message says what is missing', () => {
  it('gives every check a phrasing for the unmet case', () => {
    const checks = source.slice(
      source.indexOf('private getOnboardingPrerequisites('),
      source.indexOf('const missingItems = checks'),
    );
    const labels = checks.match(/^\s+label: '/gm) ?? [];
    const unmet = checks.match(/^\s+unmet: '/gm) ?? [];
    expect(labels.length).toBeGreaterThan(4);
    expect(unmet).toHaveLength(labels.length);
  });

  it('builds the message from the unmet phrasing, not the checklist label', () => {
    expect(source).toContain('.map((item) => item.unmet)');
    expect(source).not.toContain(
      '.filter((item) => !item.passed)\n      .map((item) => item.label)',
    );
  });

  it('phrases the unmet cases negatively so they agree with the header', () => {
    /*
     * The header says "prerequisites are not complete". Every item after that
     * colon has to be a thing that is wrong, or the sentence argues with itself
     * — which is exactly what it did.
     *
     * Asserted as "carries a negation" rather than "avoids the word selected":
     * "no industry is selected" is a correct negative phrasing that contains
     * the positive one as a substring, so a substring check would reject the
     * fix while accepting a worse wording.
     */
    const unmet = [...source.matchAll(/^\s+unmet: '([^']+)'/gm)].map(
      (match) => match[1],
    );
    expect(unmet.length).toBeGreaterThan(4);
    for (const phrase of unmet) {
      const negated =
        /^no\b/.test(phrase) ||
        /\bnot\b/.test(phrase) ||
        /\bincomplete\b/.test(phrase);
      expect([phrase, negated]).toEqual([phrase, true]);
    }
  });

  it('never states an unmet case as the label already states it', () => {
    // The defect in one line: the message listed the checklist labels. A
    // phrasing pair identical bar capitalisation is this bug returning.
    const pairs = [
      ...source.matchAll(/label: '([^']+)',\s*\n\s*unmet: '([^']+)'/g),
    ];
    expect(pairs.length).toBeGreaterThan(4);
    for (const [, label, unmet] of pairs) {
      expect([label, unmet.toLowerCase() === label.toLowerCase()]).toEqual([
        label,
        false,
      ]);
    }
  });

  it('keeps the positive label for the checklist that renders ticks', () => {
    // Both phrasings exist because they are read in two directions. Removing
    // the positive one would break the checklist to fix the message.
    expect(source).toContain("label: 'Industry is selected'");
    expect(source).toContain("unmet: 'no industry is selected'");
  });
});

/**
 * BUG-1545 — admin-initiated onboarding failed on a foreign key.
 *
 * `CustomerOnboarding.onboardingOwnerUserId` is declared `User?` — a *tenant*
 * user — and the create expression fell back to `customer.assignedToUserId`
 * (declared `PlatformUser?`) and then to `actor.platform?.id`. Both are
 * platform ids, so every admin-created onboarding was rejected. The paid-signup
 * path sets the owner differently and was unaffected.
 */
describe('BUG-1545 — no platform id is written to a tenant-user column', () => {
  const createOnboarding = source.slice(
    source.indexOf(
      'const onboarding = await this.prisma.customerOnboarding.create(',
    ),
    source.indexOf(
      'const onboarding = await this.prisma.customerOnboarding.create(',
    ) + 2000,
  );

  it('does not fall back to the acting platform user', () => {
    const code = createOnboarding.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).toContain(
      'onboardingOwnerUserId: dto?.onboardingOwnerUserId ?? null',
    );
    expect(code).not.toContain('actor.platform?.id');
  });

  it('does not fall back to the customer owner, which is also a platform user', () => {
    const code = createOnboarding.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(
      /onboardingOwnerUserId:[\s\S]{0,120}customer\.assignedToUserId/,
    );
  });
});

/**
 * BUG-1555 — an inactive plan with no prices was offered, and accepted.
 *
 * The picker is a usability improvement; this is the enforcement point. A plan
 * id can still arrive from a lead's `agreedPlanId`, from a customer chosen
 * before the plan was retired, or straight from the API.
 */
describe('BUG-1555 — a tenant is not provisioned onto an unsellable plan', () => {
  it('checks the plan is active and priced, not merely present', () => {
    const guard = source.slice(
      source.indexOf(
        'Plan and billing cycle are required before tenant creation.',
      ),
      source.indexOf('const tenantName ='),
    );
    expect(guard).toContain('isActive');
    expect(guard).toContain('_count');
    expect(guard).toContain('prices');
    expect(guard).toContain('cannot be sold');
  });

  it('counts only active prices', () => {
    // An inactive price bills nobody, so a plan carrying only inactive prices
    // is as unsellable as one carrying none.
    const guard = source.slice(
      source.indexOf(
        'Plan and billing cycle are required before tenant creation.',
      ),
      source.indexOf('const tenantName ='),
    );
    expect(guard).toMatch(/prices:\s*\{\s*where:\s*\{\s*isActive:\s*true/);
  });

  it('says which of the two reasons applies', () => {
    const guard = source.slice(
      source.indexOf(
        'Plan and billing cycle are required before tenant creation.',
      ),
      source.indexOf('const tenantName ='),
    );
    expect(guard).toContain('has no active price');
    expect(guard).toContain('inactive');
  });
});
