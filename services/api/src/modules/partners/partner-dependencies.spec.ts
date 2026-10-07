import { Prisma } from '@prisma/client';

import {
  classifyPartnerDependencies,
  PARTNER_DEPENDENCY_COUNT_SELECT,
  PARTNER_DEPENDENCY_RULES,
} from './partner-dependencies';
import {
  blocksDelete,
  buildDependencyReport,
} from '../../common/deletion/record-dependencies';

/**
 * EXECPLAN-0055 D5 — every relation into Partner is classified, and the
 * classification is the one the business decided.
 *
 * The failure this exists for: `CustomerAccount.originatingPartnerId` and
 * `Tenant.originatingPartnerId` are `SetNull`, nobody counted them, and
 * deleting a partner silently erased which partner brought the customer in.
 */

const partnerModel = Prisma.dmmf.datamodel.models.find(
  (model) => model.name === 'Partner',
);

describe('partner dependency rules', () => {
  it('classify every inbound list relation on Partner — none is left unconsidered', () => {
    /*
     * The runtime DMMF on this client carries no `isList` and no FK fields, so
     * the one relation Partner itself owns (its assigned operator) is named
     * here. A new relation of either direction fails this test until somebody
     * decides what a delete does to it.
     */
    const OUTBOUND = ['assignedToUser'];
    const inbound = (partnerModel?.fields ?? [])
      .filter(
        (field) => field.kind === 'object' && !OUTBOUND.includes(field.name),
      )
      .map((field) => field.name)
      .sort();
    const classified = Object.keys(PARTNER_DEPENDENCY_COUNT_SELECT).sort();
    expect(inbound.length).toBeGreaterThan(10);
    expect(classified).toEqual(inbound);
  });

  it.each([
    ['commissions', 'BLOCKS'],
    ['leads', 'RETAIN'],
    ['attributedCustomers', 'RETAIN'],
    ['attributedTenants', 'RETAIN'],
    ['agreements', 'BLOCKS'],
    ['inquiries', 'BLOCKS'],
    ['onboardingApplications', 'BLOCKS'],
    ['portalUsers', 'BLOCKS'],
    ['referralLinks', 'BLOCKS'],
    ['attributionCorrections', 'BLOCKS'],
    ['leadReviews', 'BLOCKS'],
    ['supportCases', 'BLOCKS'],
    ['timeline', 'CASCADE'],
  ])('%s is %s', (key, policy) => {
    const rule = PARTNER_DEPENDENCY_RULES.find((item) => item.key === key);
    expect(rule?.policy).toBe(policy);
  });

  it('never lets the database cascade into commissions', () => {
    /*
     * The schema says Cascade. A partner with one commission is refused, and
     * the commissions are never in the "will also be deleted" list.
     */
    const report = buildDependencyReport(
      classifyPartnerDependencies('p1', { commissions: 1 }),
    );
    expect(report.canDelete).toBe(false);
    expect(
      report.dependencies.filter((item) => item.policy === 'CASCADE'),
    ).toEqual([]);
  });

  it('retains customer and tenant attribution by refusing the delete', () => {
    const report = buildDependencyReport(
      classifyPartnerDependencies('p1', {
        attributedCustomers: 2,
        attributedTenants: 1,
      }),
    );
    expect(report.canDelete).toBe(false);
    expect(report.dependencies.map((item) => [item.key, item.count])).toEqual([
      ['attributedCustomers', 2],
      ['attributedTenants', 1],
    ]);
    expect(report.dependencies.every(blocksDelete)).toBe(true);
  });

  it('allows a partner with only its own timeline, listing the timeline as cascaded', () => {
    const report = buildDependencyReport(
      classifyPartnerDependencies('p1', { timeline: 4 }),
    );
    expect(report).toEqual({
      canDelete: true,
      dependencies: [
        expect.objectContaining({
          key: 'timeline',
          count: 4,
          policy: 'CASCADE',
          href: '/partners/p1?tab=timeline',
        }),
      ],
    });
  });

  it('sums both directions of attribution history into one dependency', () => {
    const [history] = classifyPartnerDependencies('p1', {
      previousAttributions: 1,
      correctedAttributions: 2,
    }).filter((item) => item.key === 'attributionCorrections');
    expect(history.count).toBe(3);
    expect(history.phrase).toBe('3 lead attribution change(s)');
  });

  it('gives every rule a reason and an admin route', () => {
    for (const item of classifyPartnerDependencies('p 1', {})) {
      expect(item.reason.length).toBeGreaterThan(10);
      expect(item.href).toMatch(/^\//);
    }
    expect(
      classifyPartnerDependencies('p 1', {}).find(
        (item) => item.key === 'referralLinks',
      )?.href,
    ).toBe('/partners/p%201?tab=referral-links');
  });

  it('omits relations with nothing in them from the report', () => {
    expect(
      buildDependencyReport(classifyPartnerDependencies('p1', {})),
    ).toEqual({ canDelete: true, dependencies: [] });
  });
});
