import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PartnerStatus } from '@prisma/client';
import { PartnerExperienceService } from './partner-experience.service';

/*
 * ADR-0026 D1 / EXECPLAN-0055 WP-04. A partner that has been live is never
 * moved back into the application or agreement funnel by a step meant for a
 * prospect:
 *   - qualifyInquiry reset a live partner to APPROVED_AWAITING_AGREEMENT;
 *   - rejectInquiry set it to REJECTED from any state, ACTIVE included;
 *   - contract signing set AGREEMENT_EXECUTED (and sending for signature
 *     AGREEMENT_IN_PROGRESS) unconditionally, so renewing a master agreement
 *     took an ACTIVE partner back to onboarding;
 *   - portal-invitation acceptance set the account ACTIVE even after the
 *     partner had been suspended.
 */

const admin = {
  userId: 'admin-1',
  tenantId: 'platform',
  email: 'admin@example.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['partners.manage'],
  platform: { id: 'admin-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as never;

function harness(partnerStatus: PartnerStatus) {
  const transaction = jest.fn();
  const prisma = {
    partnerInquiry: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'inquiry-1',
          status: 'NEW',
          partnerId: 'partner-1',
          type: 'COMPANY',
          email: 'a@example.test',
        }),
      ),
    },
    partner: {
      findUnique: jest.fn(() => Promise.resolve({ status: partnerStatus })),
    },
    platformSetting: { findUnique: jest.fn(() => Promise.resolve(null)) },
    $transaction: transaction,
  };
  const instance = new PartnerExperienceService(
    prisma as never,
    {} as never,
    { sendEmail: jest.fn() } as never,
    { record: jest.fn() } as never,
    {} as never,
    { log: jest.fn() } as never,
    {} as never,
  );
  return { instance, transaction };
}

describe('application decisions refuse a live partner', () => {
  it.each([
    PartnerStatus.ACTIVE,
    PartnerStatus.SUSPENDED,
    PartnerStatus.INACTIVE,
    PartnerStatus.TERMINATED,
  ])(
    'qualify and reject both refuse a %s partner, writing nothing',
    async (status) => {
      for (const method of ['qualifyInquiry', 'rejectInquiry'] as const) {
        const { instance, transaction } = harness(status);
        await expect(
          instance[method](admin, 'inquiry-1', { notes: 'x' } as never),
        ).rejects.toMatchObject({ errorCode: 'PARTNER_ALREADY_LIVE' });
        expect(transaction).not.toHaveBeenCalled();
      }
    },
  );

  it('still lets a partner in review be rejected', async () => {
    const { instance, transaction } = harness(PartnerStatus.UNDER_REVIEW);
    transaction.mockRejectedValue(new Error('reached the write'));
    await expect(
      instance.rejectInquiry(admin, 'inquiry-1', { notes: 'x' } as never),
    ).rejects.toThrow('reached the write');
  });
});

/*
 * Asserted against the source, as partner-number-assignment.spec.ts does: the
 * two contract writes sit deep inside the signing and sending transactions,
 * and standing those up to observe one guarded update would fail for reasons
 * unrelated to it. What matters is structural — neither write can touch a
 * partner in a live status.
 */
function code(file: string) {
  return readFileSync(join(__dirname, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('agreement activity never demotes a live partner', () => {
  const contracts = code('../contracts/contracts.service.ts');

  it.each(['AGREEMENT_IN_PROGRESS', 'AGREEMENT_EXECUTED'])(
    'the write that sets %s excludes live partners',
    (status) => {
      const at = contracts.indexOf(`data: { status: PartnerStatus.${status} }`);
      expect(at).toBeGreaterThan(-1);
      const call = contracts.slice(
        contracts.lastIndexOf('tx.partner.', at),
        at,
      );
      expect(call).toMatch(/^tx\.partner\.updateMany\(/);
      expect(call).toMatch(
        /status:\s*\{\s*notIn:\s*\[\.\.\.PARTNER_LIVE_STATUSES\]/,
      );
    },
  );

  it('derives the live set from the shared lifecycle module', () => {
    expect(contracts).toMatch(
      /PARTNER_LIVE_STATUSES =\s*PARTNER_POST_ACTIVATION_STATUSES/,
    );
  });

  it('only promotes an INVITED account when the invitation is accepted', () => {
    const experience = code('partner-experience.service.ts');
    const at = experience.indexOf("data: { accountStatus: 'ACTIVE' }");
    expect(at).toBeGreaterThan(-1);
    expect(experience.slice(at - 200, at)).toMatch(
      /partner\.updateMany\(\{\s*where: \{ id: user\.partnerId, accountStatus: 'INVITED' \}/,
    );
  });
});
