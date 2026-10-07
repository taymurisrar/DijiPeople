import { NotFoundException } from '@nestjs/common';
import { PlatformUserRole } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
import {
  isContactRemovable,
  NEVER_ACTIVATED_CONTACT_WHERE,
} from './partner-contacts';
import { describePortalContact } from './partner-related-records';
import { PartnersService } from './partners.service';

/*
 * TASK-0037 browser pass — a contact added from the partner record could not
 * be removed by anything, and kept its partner undeletable.
 *
 * Remove contact deletes a contact that never activated portal access, and
 * refuses one that did: that contact is a login with an access history, ended
 * by suspending or deactivating the partner, never by deleting the row.
 */

type Contact = {
  id: string;
  partnerId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  invitationExpiresAt: Date | null;
  activatedAt: Date | null;
  lastActiveAt: Date | null;
};

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    partnerId: 'partner-1',
    email: 'grace@contoso.test',
    firstName: 'Grace',
    lastName: 'Hopper',
    status: 'NOT_INVITED',
    invitationExpiresAt: null,
    activatedAt: null,
    lastActiveAt: null,
    ...overrides,
  };
}

type ContactWhere = {
  id: string;
  partnerId: string;
  status?: { in: string[] };
  activatedAt?: null;
  lastActiveAt?: null;
};

/**
 * Applies whatever filter the delete actually sent, the way Postgres would —
 * so a delete that drops the never-activated condition deletes an ACTIVE
 * contact here too, and the refusal tests fail.
 */
function matchesWhere(row: Contact, where: ContactWhere) {
  return (
    row.id === where.id &&
    row.partnerId === where.partnerId &&
    (!where.status || where.status.in.includes(row.status)) &&
    (!('activatedAt' in where) || row.activatedAt === where.activatedAt) &&
    (!('lastActiveAt' in where) || row.lastActiveAt === where.lastActiveAt)
  );
}

function harness(rows: Contact[]) {
  const events: string[] = [];
  const db = {
    partnerPortalUser: {
      findFirst: jest.fn(
        ({ where }: { where: { id: string; partnerId: string } }) =>
          Promise.resolve(
            rows.find(
              (row) => row.id === where.id && row.partnerId === where.partnerId,
            ) ?? null,
          ),
      ),
      deleteMany: jest.fn(({ where }: { where: ContactWhere }) => {
        events.push('delete');
        const hit = rows.filter((row) => matchesWhere(row, where));
        return Promise.resolve({ count: hit.length });
      }),
    },
    partnerTimeline: {
      create: jest.fn((args: unknown) => {
        events.push('timeline');
        return Promise.resolve(args);
      }),
    },
  };
  const transaction = jest.fn(async (work: (tx: typeof db) => unknown) =>
    work(db),
  );
  const audit = {
    log: jest.fn(() => {
      events.push('audit');
      return Promise.resolve(undefined);
    }),
  };
  const service = new PartnersService(
    { ...db, $transaction: transaction } as never,
    audit as never,
    {} as never,
  );
  return { service, db, audit, events, transaction };
}

async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('PartnersService.removeContact', () => {
  it('removes a never-invited contact, with a timeline entry and an audit row in the transaction', async () => {
    const { service, db, audit, events } = harness([contact()]);

    await expect(
      service.removeContact('partner-1', 'contact-1', 'op-1'),
    ).resolves.toEqual({ success: true, message: 'Contact removed.' });

    expect(db.partnerPortalUser.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'contact-1',
        partnerId: 'partner-1',
        ...NEVER_ACTIVATED_CONTACT_WHERE,
      },
    });
    expect(db.partnerTimeline.create).toHaveBeenCalledWith({
      data: {
        partnerId: 'partner-1',
        eventType: 'CONTACT_REMOVED',
        actorType: 'PLATFORM_USER',
        actorId: 'op-1',
        message: 'Contact Grace Hopper was removed.',
      },
    });
    expect(events).toEqual(['delete', 'timeline', 'audit']);
    const [entry, client] = audit.log.mock.calls[0] as unknown as [
      Record<string, unknown>,
      unknown,
    ];
    // Audited through the transaction client, so it commits with the delete.
    expect(client).toBe(db);
    expect(entry).toEqual({
      tenantId: 'platform',
      actorUserId: 'op-1',
      action: 'PARTNER_CONTACT_REMOVED',
      entityType: 'Partner',
      entityId: 'partner-1',
      beforeSnapshot: {
        contactId: 'contact-1',
        email: 'grace@contoso.test',
        status: 'NOT_INVITED',
        pendingInvitation: false,
      },
      afterSnapshot: { removed: true },
    });
  });

  it('removes an invited contact that never accepted, revoking the pending invitation with the row', async () => {
    const { service, audit } = harness([
      contact({
        status: 'INVITED',
        invitationExpiresAt: new Date('2026-10-15T00:00:00Z'),
      }),
    ]);

    await service.removeContact('partner-1', 'contact-1', 'op-1');

    const entry = (
      audit.log.mock.calls[0] as unknown as [
        { beforeSnapshot: Record<string, unknown> },
      ]
    )[0];
    expect(entry.beforeSnapshot).toMatchObject({
      status: 'INVITED',
      pendingInvitation: true,
    });
    // Never a credential in the audit row.
    expect(JSON.stringify(entry)).not.toMatch(/passwordHash|invitationToken/);
  });

  it.each([
    ['an ACTIVE contact', { status: 'ACTIVE', activatedAt: new Date() }],
    [
      'a contact that activated and was later re-invited',
      { status: 'INVITED', activatedAt: new Date() },
    ],
    [
      'a contact that has signed in',
      { status: 'INVITED', lastActiveAt: new Date() },
    ],
  ])(
    'refuses %s with PARTNER_CONTACT_HAS_PORTAL_ACCESS (409), writing nothing',
    async (_name, overrides) => {
      const { service, db, audit } = harness([contact(overrides)]);

      const error = await rejection(() =>
        service.removeContact('partner-1', 'contact-1', 'op-1'),
      );

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        errorCode: 'PARTNER_CONTACT_HAS_PORTAL_ACCESS',
        statusCode: 409,
      });
      expect((error as Error).message).toMatch(
        /Suspend or deactivate the partner/,
      );
      expect(db.partnerTimeline.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for another partner's contact and deletes nothing", async () => {
    const { service, db, audit } = harness([
      contact({ partnerId: 'partner-2' }),
    ]);

    await expect(
      service.removeContact('partner-1', 'contact-1', 'op-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.partnerPortalUser.deleteMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('answers 404 for a contact that does not exist', async () => {
    const { service } = harness([]);
    await expect(
      service.removeContact('partner-1', 'missing', 'op-1'),
    ).rejects.toThrow('Contact was not found.');
  });
});

describe('PartnersService.removeContactForUser authorization', () => {
  function platformUser(role: PlatformUserRole): AuthenticatedUser {
    const access = platformAccessForRole(role);
    return {
      userId: 'platform-user',
      tenantId: 'platform',
      roleIds: [],
      roleKeys: access.roleKeys,
      permissionKeys: access.permissionKeys,
      platform: { id: 'platform-user', role },
    };
  }

  it('requires partners.manage', () => {
    const { service } = harness([contact()]);
    const remove = jest
      .spyOn(service, 'removeContact')
      .mockResolvedValue({} as never);
    expect(() =>
      service.removeContactForUser(
        platformUser(PlatformUserRole.PRESALES_USER),
        'partner-1',
        'contact-1',
      ),
    ).toThrow('Partner management access is required.');
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses a tenant JWT even when it carries partners.manage', () => {
    const { service } = harness([contact()]);
    expect(() =>
      service.removeContactForUser(
        {
          userId: 'tenant-user',
          tenantId: 'tenant-a',
          roleIds: [],
          roleKeys: [],
          permissionKeys: ['partners.manage'],
        },
        'partner-1',
        'contact-1',
      ),
    ).toThrow('Platform access is required.');
  });

  it('lets PARTNER_MANAGER remove, with the operator as actor', async () => {
    const { service } = harness([contact()]);
    const remove = jest
      .spyOn(service, 'removeContact')
      .mockResolvedValue({} as never);
    await service.removeContactForUser(
      platformUser(PlatformUserRole.PARTNER_MANAGER),
      'partner-1',
      'contact-1',
    );
    expect(remove).toHaveBeenCalledWith(
      'partner-1',
      'contact-1',
      'platform-user',
    );
  });
});

describe('which contacts are removable', () => {
  it.each([
    [{ status: 'NOT_INVITED' }, true],
    [{ status: 'INVITED' }, true],
    [{ status: 'ACTIVE' }, false],
    [{ status: 'INVITED', activatedAt: '2026-10-01T00:00:00Z' }, false],
    [{ status: 'NOT_INVITED', lastActiveAt: '2026-10-01T00:00:00Z' }, false],
    [{ status: 'DISABLED' }, false],
  ])('%o → %s', (fields, expected) => {
    expect(isContactRemovable(fields)).toBe(expected);
  });

  it('is what the Contacts tab is given as canRemove', () => {
    expect(
      describePortalContact({
        firstName: 'Grace',
        lastName: 'Hopper',
        status: 'NOT_INVITED',
        activatedAt: null,
        lastActiveAt: null,
      }),
    ).toMatchObject({ fullName: 'Grace Hopper', canRemove: true });
    expect(
      describePortalContact({
        firstName: 'Ada',
        lastName: 'Lovelace',
        status: 'ACTIVE',
        activatedAt: new Date(),
        lastActiveAt: null,
      }),
    ).toMatchObject({ canRemove: false });
  });
});
