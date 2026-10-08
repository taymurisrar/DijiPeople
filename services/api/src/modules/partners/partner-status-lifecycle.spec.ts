import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PartnerAccountStatus,
  PartnerStatus,
  PartnerType,
  PartnershipModel,
} from '@prisma/client';
import {
  PARTNER_LIFECYCLE_ACTIONS,
  PARTNER_PHASES,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_PHASES,
  partnerPhaseOf,
} from '@repo/config';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import { PartnersService } from './partners.service';
import {
  accountStatusAfterAction,
  assertPartnerNotLive,
  partnerTransition,
} from './partner-lifecycle';

/*
 * ADR-0026 / EXECPLAN-0055 WP-04 — a partner's status is action-driven.
 *
 * Before: create accepted any status (a partner could be born ACTIVE, past
 * every agreement and onboarding gate); PATCH could move between any two
 * non-ACTIVE states with no timeline entry; activation had no status guard;
 * reactivate reported a portal account as ACTIVE whether or not anyone had
 * ever signed in.
 */

const VALID = {
  type: PartnerType.COMPANY,
  companyName: 'Acme Partners Ltd',
  displayName: 'Acme Partners',
  email: 'partner@example.com',
  defaultCommissionRate: 10,
};

/** What `run` throws, for asserting on its domain code. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

async function failures(Dto: new () => object, body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(Dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('partner DTOs carry no system-controlled field', () => {
  it.each([
    ['status', PartnerStatus.ACTIVE],
    ['accountStatus', PartnerAccountStatus.ACTIVE],
    ['partnerNumber', 'PART-000001'],
    ['code', 'PTR-1'],
  ])('refuses %s on create and on update', async (field, value) => {
    for (const Dto of [CreatePartnerDto, UpdatePartnerDto])
      expect(await failures(Dto, { ...VALID, [field]: value })).toContain(
        field,
      );
  });

  it('accepts partnershipModel, validated against the enum', async () => {
    expect(
      await failures(CreatePartnerDto, {
        ...VALID,
        partnershipModel: PartnershipModel.RESELLER,
      }),
    ).toEqual([]);
    expect(
      await failures(UpdatePartnerDto, { partnershipModel: 'FRANCHISE' }),
    ).toContain('partnershipModel');
  });

  it.each([
    [12.5, true],
    [100, true],
    [0, true],
    [12.345, false],
    [100.01, false],
    [-1, false],
  ])('defaultCommissionRate %p valid: %p', async (rate, ok) => {
    const result = await failures(UpdatePartnerDto, {
      defaultCommissionRate: rate,
    });
    expect(result.includes('defaultCommissionRate')).toBe(!ok);
  });
});

describe('partner create always starts at DRAFT', () => {
  function service() {
    const created: Array<Record<string, unknown>> = [];
    const prisma: Record<string, unknown> = {
      partner: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ id: 'partner-new', ...data });
        }),
        findFirst: jest.fn(() => Promise.resolve(null)),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      platformSetting: { findUnique: jest.fn(() => Promise.resolve(null)) },
    };
    prisma.$transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    const instance = new PartnersService(
      prisma as never,
      { log: jest.fn() } as never,
      { next: jest.fn(() => Promise.resolve('PART-000007')) } as never,
    );
    return { instance, created };
  }

  it('ignores a status an internal caller smuggles past the DTO', async () => {
    const { instance, created } = service();
    await instance.create(
      {
        ...VALID,
        status: PartnerStatus.ACTIVE,
        accountStatus: PartnerAccountStatus.ACTIVE,
      } as never,
      'actor-1',
    );
    expect(created[0]).toMatchObject({
      status: PartnerStatus.DRAFT,
      accountStatus: PartnerAccountStatus.NOT_PROVISIONED,
      partnerNumber: 'PART-000007',
    });
  });

  it('persists partnershipModel instead of dropping it', async () => {
    const { instance, created } = service();
    await instance.create(
      { ...VALID, partnershipModel: PartnershipModel.REFERRAL } as never,
      'actor-1',
    );
    expect(created[0]).toMatchObject({
      partnershipModel: PartnershipModel.REFERRAL,
    });
  });
});

describe('partner phase mapping', () => {
  /*
   * From the generated Prisma enum, not a copied list: a PartnerStatus added
   * to the schema without a phase fails here (and in partner-lifecycle.test.js,
   * which reads schema.prisma directly).
   */
  it.each(Object.values(PartnerStatus))(
    '%s has a phase and a label',
    (status) => {
      expect(PARTNER_PHASES).toContain(partnerPhaseOf(status));
      expect(PARTNER_STATUS_LABELS[status]).toEqual(expect.any(String));
    },
  );

  it('covers exactly the Prisma enum', () => {
    expect(Object.keys(PARTNER_STATUS_PHASES).sort()).toEqual(
      Object.values(PartnerStatus).sort(),
    );
  });
});

describe('partner lifecycle transitions', () => {
  it('activates from the state onboarding approval leaves, not before it', () => {
    expect(
      partnerTransition(PartnerStatus.INFORMATION_APPROVED, 'activate'),
    ).toBe(PartnerStatus.ACTIVE);
    for (const status of [
      PartnerStatus.ONBOARDING_PENDING,
      PartnerStatus.ACTIVE,
      PartnerStatus.SUSPENDED,
    ])
      expect(
        thrownBy(() => partnerTransition(status, 'activate')),
      ).toMatchObject({ errorCode: 'PARTNER_ACTION_NOT_AVAILABLE' });
  });

  it('keeps every action target a real status', () => {
    for (const rule of Object.values(PARTNER_LIFECYCLE_ACTIONS))
      expect(Object.values(PartnerStatus)).toContain(rule.to);
  });

  it.each([
    ['suspend', false, PartnerAccountStatus.SUSPENDED],
    ['deactivate', true, PartnerAccountStatus.DISABLED],
    ['reactivate', true, PartnerAccountStatus.ACTIVE],
    ['reactivate', false, PartnerAccountStatus.INVITED],
    ['start-review', false, undefined],
  ] as const)(
    'account status after %s (portal user activated: %p) is %p',
    (action, activated, expected) => {
      expect(accountStatusAfterAction(action, activated)).toBe(expected);
    },
  );

  it.each([
    PartnerStatus.ACTIVE,
    PartnerStatus.SUSPENDED,
    PartnerStatus.INACTIVE,
    PartnerStatus.TERMINATED,
  ])('treats %s as live', (status) => {
    expect(
      thrownBy(() => assertPartnerNotLive(status, 'Approving')),
    ).toMatchObject({ errorCode: 'PARTNER_ALREADY_LIVE' });
  });

  it('lets a partner still in the funnel through', () => {
    expect(() =>
      assertPartnerNotLive(PartnerStatus.UNDER_REVIEW, 'Approving'),
    ).not.toThrow();
  });
});

describe('lifecycleAction records who moved the partner', () => {
  it('writes the timeline and the audit row with the actor and account status', async () => {
    const timeline = jest.fn((args: unknown) => Promise.resolve(args));
    const update = jest.fn((args: unknown) => Promise.resolve(args));
    const audit = jest.fn((entry: unknown) => entry);
    const partner = {
      id: 'partner-1',
      displayName: 'Acme',
      status: PartnerStatus.SUSPENDED,
      accountStatus: PartnerAccountStatus.SUSPENDED,
      portalUsers: [{ status: 'INVITED' }],
    };
    const prisma = {
      partner: { update },
      partnerTimeline: { create: timeline },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    const instance = new PartnersService(
      prisma as never,
      { log: audit } as never,
      {} as never,
    );
    jest.spyOn(instance, 'get').mockResolvedValue(partner as never);

    await instance.lifecycleAction('partner-1', 'actor-9', {
      action: 'reactivate',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'partner-1' },
      data: {
        status: PartnerStatus.ACTIVE,
        accountStatus: PartnerAccountStatus.INVITED,
      },
    });
    expect(timeline.mock.calls[0]?.[0]).toMatchObject({
      data: { eventType: 'PARTNER_REACTIVATE', actorId: 'actor-9' },
    });
    expect(audit.mock.calls[0]?.[0]).toMatchObject({
      actorUserId: 'actor-9',
      tenantId: 'platform',
      afterSnapshot: {
        status: PartnerStatus.ACTIVE,
        accountStatus: PartnerAccountStatus.INVITED,
      },
    });
  });
});
