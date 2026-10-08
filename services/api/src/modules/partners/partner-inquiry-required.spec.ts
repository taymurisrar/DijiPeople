import { NotFoundException } from '@nestjs/common';
import { PartnerAccountStatus, PartnerStatus } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformRuntimeService } from '../platform-runtime/platform-runtime.service';
import { PartnersService } from './partners.service';

/*
 * ADR-0026 — two entry paths into the partner lifecycle.
 *
 * A partner from the public inquiry form carries a PartnerInquiry, and the
 * application-review actions (start review, approve, reject, request
 * information) decide it. A partner an operator creates in the console starts
 * at DRAFT with no inquiry and takes the agreement-first path. Before this,
 * Approve/Reject on such a partner threw a bare 400 ("The immutable partner
 * application submission was not found.") that the console showed as a
 * generic VALIDATION_FAILED, and nothing told the operator what to do instead.
 */

function consolePartner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    displayName: 'Acme',
    status: PartnerStatus.DRAFT,
    accountStatus: PartnerAccountStatus.NOT_PROVISIONED,
    portalUsers: [],
    hasInquiry: false,
    ...overrides,
  };
}

async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('PartnersService.get exposes whether the partner came from an inquiry', () => {
  function serviceReturning(inquiries: unknown[]) {
    const prisma = {
      partner: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'partner-1',
            status: PartnerStatus.DRAFT,
            defaultCommissionRate: 10,
            assignedToUser: null,
            leads: [],
            agreements: [],
            commissions: [],
            inquiries,
            onboardingApplications: [],
            portalUsers: [],
            referralLinks: [],
            attributedCustomers: [],
            attributedTenants: [],
            timeline: [],
          }),
        ),
      },
    };
    return new PartnersService(prisma as never, {} as never, {} as never);
  }

  it('is false for a partner created in the console', async () => {
    await expect(serviceReturning([]).get('partner-1')).resolves.toMatchObject({
      hasInquiry: false,
    });
  });

  it('is true for a partner with a partner inquiry', async () => {
    await expect(
      serviceReturning([{ id: 'inquiry-1' }]).get('partner-1'),
    ).resolves.toMatchObject({ hasInquiry: true });
  });
});

describe('PartnersService.lifecycleAction on a partner with no inquiry', () => {
  function service(partner: Record<string, unknown>) {
    const update = jest.fn((args: unknown) => Promise.resolve(args));
    const prisma = {
      partner: { update },
      partnerTimeline: { create: jest.fn((args: unknown) => args) },
      partnerInquiry: { updateMany: jest.fn((args: unknown) => args) },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    const instance = new PartnersService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
    );
    jest.spyOn(instance, 'get').mockResolvedValue(partner as never);
    return { instance, update };
  }

  it.each([
    'start-review',
    'request-information',
    'approve',
    'reject',
  ] as const)(
    'refuses %s with PARTNER_INQUIRY_REQUIRED (409) and writes nothing',
    async (action) => {
      // Even in a status the review actions accept: the inquiry is the reason.
      const { instance, update } = service(
        consolePartner({ status: PartnerStatus.NEW_INQUIRY }),
      );
      const error = await rejection(() =>
        instance.lifecycleAction('partner-1', 'actor-1', { action }),
      );
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        errorCode: 'PARTNER_INQUIRY_REQUIRED',
        statusCode: 409,
      });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('explains the DRAFT case rather than calling the action unavailable', async () => {
    const { instance } = service(consolePartner());
    await expect(
      rejection(() =>
        instance.lifecycleAction('partner-1', 'actor-1', {
          action: 'start-review',
        }),
      ),
    ).resolves.toMatchObject({ errorCode: 'PARTNER_INQUIRY_REQUIRED' });
  });

  it('still runs the lifecycle actions that do not decide an application', async () => {
    const { instance, update } = service(
      consolePartner({ status: PartnerStatus.ACTIVE }),
    );
    await instance.lifecycleAction('partner-1', 'actor-1', {
      action: 'suspend',
    });
    expect(update).toHaveBeenCalled();
  });

  it('lets an inquiry partner start review as before', async () => {
    const { instance, update } = service(
      consolePartner({ status: PartnerStatus.NEW_INQUIRY, hasInquiry: true }),
    );
    await instance.lifecycleAction('partner-1', 'actor-1', {
      action: 'start-review',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'partner-1' },
      data: { status: PartnerStatus.UNDER_REVIEW },
    });
  });
});

describe('PlatformRuntimeService approve/reject on a partner with no inquiry', () => {
  function owner(): AuthenticatedUser {
    return {
      userId: 'platform-owner',
      tenantId: 'platform',
      roleIds: [],
      roleKeys: [],
      permissionKeys: [],
      rolePrivileges: [],
      platform: {
        id: 'p1',
        role: 'PLATFORM_OWNER',
        permissionKeys: ['platform.*'],
      },
    } as unknown as AuthenticatedUser;
  }

  function service(partnerExists = true) {
    const qualifyInquiry = jest.fn();
    const rejectInquiry = jest.fn();
    const findInquiry = jest.fn(() => Promise.resolve(null));
    const runtime = new PlatformRuntimeService(
      {
        partner: {
          findUnique: () =>
            Promise.resolve(partnerExists ? { id: 'partner-1' } : null),
        },
        partnerInquiry: { findFirst: findInquiry },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { qualifyInquiry, rejectInquiry } as never,
      {} as never,
      {} as never,
    );
    return { runtime, qualifyInquiry, rejectInquiry, findInquiry };
  }

  it.each(['approve-partner', 'reject-partner'])(
    '%s answers 404 for a partner that does not exist, before any inquiry check',
    async (action) => {
      const { runtime, findInquiry, qualifyInquiry, rejectInquiry } =
        service(false);
      const error = await rejection(() =>
        runtime.execute(owner(), 'partners', action, {}, 'missing-partner'),
      );
      expect(error).toBeInstanceOf(NotFoundException);
      expect(findInquiry).not.toHaveBeenCalled();
      expect(qualifyInquiry).not.toHaveBeenCalled();
      expect(rejectInquiry).not.toHaveBeenCalled();
    },
  );

  it.each(['approve-partner', 'reject-partner'])(
    '%s answers PARTNER_INQUIRY_REQUIRED (409), not a bare 400',
    async (action) => {
      const { runtime, qualifyInquiry, rejectInquiry } = service();
      const error = await rejection(() =>
        runtime.execute(owner(), 'partners', action, {}, 'partner-1'),
      );
      expect(error).toMatchObject({
        errorCode: 'PARTNER_INQUIRY_REQUIRED',
        statusCode: 409,
      });
      expect((error as Error).message).toMatch(/Create an agreement/);
      expect(qualifyInquiry).not.toHaveBeenCalled();
      expect(rejectInquiry).not.toHaveBeenCalled();
    },
  );
});
