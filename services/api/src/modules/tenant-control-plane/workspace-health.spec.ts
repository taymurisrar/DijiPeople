import { TenantStatus } from '@prisma/client';

import {
  deriveWorkspaceHealth,
  type WorkspaceFacts,
} from './tenant-operations.service';

function facts(overrides: Partial<WorkspaceFacts> = {}): WorkspaceFacts {
  return {
    slug: 'xoul-ltd',
    status: TenantStatus.ACTIVE,
    subStatus: null,
    ownerUserId: 'owner-1',
    primaryHostname: 'xoul-ltd.dijipeople.com',
    hostnameVerification: 'VERIFIED',
    businessUnitCount: 1,
    userCount: 3,
    ...overrides,
  };
}

const keys = (input: Partial<WorkspaceFacts> = {}) =>
  deriveWorkspaceHealth(facts(input)).findings.map((finding) => finding.key);

/**
 * Why a working tenant reported that it was not provisioned.
 *
 * The screen this exists for showed an ACTIVE, reachable, signed-into workspace
 * reporting "Workspace: Not provisioned", "Primary tenant owner: Unassigned", a
 * status reason of "Provisioning", and no recorded provisioning run — four true
 * statements that together answered nothing. The one available action, Retry
 * provisioning, refused: accurately, because the tenant was not being
 * provisioned.
 *
 * The mistake was reading the workspace's health off its provisioning *runs*. A
 * run is a record of an attempt; a tenant can be entirely usable with no run
 * rows at all. These assertions are about the tenant's own state.
 */
describe('workspace health', () => {
  it('reports nothing wrong with a complete workspace', () => {
    const health = deriveWorkspaceHealth(facts());
    expect(health.healthy).toBe(true);
    expect(health.repairable).toBe(false);
    expect(health.findings).toEqual([]);
  });

  describe('a missing hostname', () => {
    it('is blocking, and repairable when a slug exists', () => {
      const health = deriveWorkspaceHealth(facts({ primaryHostname: null }));
      const finding = health.findings.find(
        (item) => item.key === 'missing-workspace-hostname',
      );
      expect(finding?.severity).toBe('BLOCKING');
      expect(finding?.repairable).toBe(true);
      expect(health.repairable).toBe(true);
    });

    it('is not repairable without a slug, because there is nothing to derive', () => {
      /*
       * Offering a Repair button here would offer an action that can only fail.
       * The detail says what to do instead — set the slug — which is the whole
       * point of carrying a sentence per finding rather than a boolean.
       */
      const health = deriveWorkspaceHealth(
        facts({ primaryHostname: null, slug: null }),
      );
      const finding = health.findings.find(
        (item) => item.key === 'missing-workspace-hostname',
      );
      expect(finding?.repairable).toBe(false);
      expect(finding?.detail).toContain('slug');
      expect(health.repairable).toBe(false);
    });
  });

  describe('a stale status reason', () => {
    it('flags an ACTIVE tenant still described as provisioning', () => {
      // The reported contradiction: an "Active" badge beside "Provisioning".
      expect(keys({ subStatus: 'Provisioning' })).toContain('stale-sub-status');
      expect(keys({ subStatus: 'Provisioning retry in progress' })).toContain(
        'stale-sub-status',
      );
    });

    it('leaves an ordinary sub-status alone', () => {
      /*
       * A sub-status is a legitimate field and most values are fine. Flagging
       * every one of them would make this finding noise, and noise is how a
       * health panel stops being read.
       */
      expect(keys({ subStatus: 'Migration in progress' })).not.toContain(
        'stale-sub-status',
      );
      expect(keys({ subStatus: 'Awaiting customer data' })).not.toContain(
        'stale-sub-status',
      );
    });

    it('leaves it alone while the tenant really is provisioning', () => {
      expect(
        keys({
          status: TenantStatus.PROVISIONING,
          subStatus: 'Provisioning',
          primaryHostname: null,
        }),
      ).not.toContain('stale-sub-status');
    });
  });

  describe('a missing business unit', () => {
    it('is blocking and explicitly not repairable here', () => {
      /*
       * BUG-0015, which is open. The provisioning step that creates a business
       * unit is not replayed, so claiming this is repairable would produce a
       * button that reports success and changes nothing — which is the shape of
       * BUG-0015 itself.
       */
      const finding = deriveWorkspaceHealth(
        facts({ businessUnitCount: 0 }),
      ).findings.find((item) => item.key === 'missing-business-unit');
      expect(finding?.severity).toBe('BLOCKING');
      expect(finding?.repairable).toBe(false);
      expect(finding?.detail).toContain('BUG-0015');
    });
  });

  describe('a missing owner', () => {
    it('distinguishes "nobody assigned" from "nobody to assign"', () => {
      // Different sentences because they need different actions: pick somebody,
      // versus invite somebody first.
      const withUsers = deriveWorkspaceHealth(
        facts({ ownerUserId: null, userCount: 4 }),
      ).findings.find((item) => item.key === 'no-primary-owner');
      const withoutUsers = deriveWorkspaceHealth(
        facts({ ownerUserId: null, userCount: 0 }),
      ).findings.find((item) => item.key === 'no-primary-owner');

      expect(withUsers?.detail).toContain('none is recorded');
      expect(withoutUsers?.detail).toContain('nobody to make the owner');
      expect(withUsers?.detail).not.toBe(withoutUsers?.detail);
    });
  });

  it('reports every deficiency at once, not the first one', () => {
    /*
     * The reported tenant had three simultaneously. A panel that stopped at the
     * first would have sent somebody to fix the hostname and left them to
     * rediscover the rest one reload at a time.
     */
    expect(
      keys({
        primaryHostname: null,
        subStatus: 'Provisioning',
        businessUnitCount: 0,
        ownerUserId: null,
      }),
    ).toEqual([
      'missing-workspace-hostname',
      'stale-sub-status',
      'missing-business-unit',
      'no-primary-owner',
    ]);
  });

  it('is repairable when any one finding is, and only then', () => {
    // The Repair button's enabled state, asserted directly.
    expect(
      deriveWorkspaceHealth(facts({ primaryHostname: null })).repairable,
    ).toBe(true);
    expect(
      deriveWorkspaceHealth(facts({ businessUnitCount: 0, ownerUserId: null }))
        .repairable,
    ).toBe(false);
  });
});
