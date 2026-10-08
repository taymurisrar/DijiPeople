import { Prisma } from '@prisma/client';
import { PartnersService } from './partners.service';
import { PlatformRuntimeService } from '../platform-runtime/platform-runtime.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/*
 * EXECPLAN-0055 WP-08 — Add Contact and timeline notes on the partner record.
 *
 * D5: a note added from the partner's Timeline tab was written to the platform
 * audit log while the tab read `PartnerTimeline`, so it never appeared. Notes
 * are now timeline entries with their actor, and the notes written the old way
 * are read back. Contacts are uninvited portal-user rows; creating one sends
 * nothing and refuses an email any portal user already holds.
 */

const PARTNER = { id: 'partner-1', displayName: 'Contoso' };

function harness(
  options: {
    partner?: Record<string, unknown> | null;
    existingContact?: Record<string, unknown> | null;
    createError?: Error;
    timeline?: Array<Record<string, unknown>>;
    legacyNotes?: Array<Record<string, unknown>>;
  } = {},
) {
  const partner = options.partner === undefined ? PARTNER : options.partner;
  const db = {
    partner: { findUnique: jest.fn(async () => partner) },
    partnerPortalUser: {
      findUnique: jest.fn(async () => options.existingContact ?? null),
      findMany: jest.fn(async () => [
        {
          id: 'portal-1',
          firstName: 'Grace',
          lastName: 'Hopper',
          email: 'g@x',
        },
      ]),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.createError) throw options.createError;
        return {
          id: 'contact-1',
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          status: data.status,
          activatedAt: null,
          lastActiveAt: null,
          createdAt: new Date('2026-10-08T00:00:00Z'),
        };
      }),
    },
    partnerTimeline: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'entry-1',
        ...data,
      })),
      findMany: jest.fn(async () => options.timeline ?? []),
    },
    platformAuditLog: {
      findMany: jest.fn(async () => options.legacyNotes ?? []),
    },
    platformUser: {
      findMany: jest.fn(async () => [
        { id: 'pu-1', firstName: 'Ada', lastName: 'Lovelace', email: 'a@x' },
      ]),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn(async (fn: (tx: typeof db) => unknown) => fn(db)),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const service = new PartnersService(
    prisma as never,
    audit as never,
    {} as never,
  );
  return { service, db, audit };
}

describe('partner notes (D5)', () => {
  it('writes the note to the partner timeline with the operator as actor', async () => {
    const { service, db, audit } = harness();

    await service.addNote('partner-1', '  Called the partner.  ', 'pu-1');

    expect(db.partnerTimeline.create).toHaveBeenCalledWith({
      data: {
        partnerId: 'partner-1',
        eventType: 'NOTE',
        actorType: 'PLATFORM_USER',
        actorId: 'pu-1',
        message: 'Called the partner.',
      },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        actorUserId: 'pu-1',
        action: 'PARTNER_NOTE_ADDED',
        entityType: 'Partner',
        entityId: 'partner-1',
      }),
    );
  });

  it('refuses an empty note on the message field, writing nothing', async () => {
    const { service, db } = harness();
    await expect(service.addNote('partner-1', '   ', 'pu-1')).rejects.toThrow(
      'Enter a note.',
    );
    expect(db.partnerTimeline.create).not.toHaveBeenCalled();
  });

  it('refuses a note for a partner that does not exist', async () => {
    const { service, db } = harness({ partner: null });
    await expect(service.addNote('missing', 'Hello', 'pu-1')).rejects.toThrow(
      'Partner was not found.',
    );
    expect(db.partnerTimeline.create).not.toHaveBeenCalled();
  });

  it('reads timeline entries and pre-fix audit notes together, newest first, with actor names', async () => {
    const { service } = harness({
      timeline: [
        {
          id: 't-new',
          eventType: 'NOTE',
          actorType: 'PLATFORM_USER',
          actorId: 'pu-1',
          message: 'New note',
          createdAt: new Date('2026-10-08T12:00:00Z'),
        },
        {
          id: 't-portal',
          eventType: 'REFERRAL_LINK_CREATED',
          actorType: 'PARTNER_USER',
          actorId: 'portal-1',
          message: 'Link',
          createdAt: new Date('2026-10-06T12:00:00Z'),
        },
      ],
      legacyNotes: [
        {
          id: 'audit-1',
          platformActorUserId: 'pu-1',
          afterSnapshot: { message: 'Old note', activityType: 'NOTE' },
          createdAt: new Date('2026-10-07T12:00:00Z'),
        },
      ],
    });

    const { items } = await service.timeline('partner-1');

    expect(items.map((item) => item.id)).toEqual([
      't-new',
      'audit-1',
      't-portal',
    ]);
    expect(items[1]).toEqual(
      expect.objectContaining({
        message: 'Old note',
        actionLabel: 'Note',
        actorName: 'Ada Lovelace',
      }),
    );
    expect(items[2].actorName).toBe('Grace Hopper');
  });
});

describe('partner contacts', () => {
  it('creates an uninvited contact with no credential and audits it', async () => {
    const { service, db, audit } = harness();

    const contact = await service.createContact(
      'partner-1',
      { firstName: ' Ada ', lastName: 'Lovelace', email: 'Ada@Example.com' },
      'pu-1',
    );

    const data = db.partnerPortalUser.create.mock.calls[0][0].data;
    expect(data).toEqual({
      partnerId: 'partner-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      passwordHash: '!NOT_INVITED!',
      status: 'NOT_INVITED',
    });
    // No invitation token: nothing can be accepted, nothing is sent.
    expect(data).not.toHaveProperty('invitationTokenHash');
    expect(contact).toEqual(
      expect.objectContaining({
        fullName: 'Ada Lovelace',
        status: 'NOT_INVITED',
      }),
    );
    expect(contact).not.toHaveProperty('passwordHash');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PARTNER_CONTACT_CREATED',
        entityId: 'partner-1',
        afterSnapshot: {
          contactId: 'contact-1',
          email: 'ada@example.com',
          status: 'NOT_INVITED',
        },
      }),
    );
    expect(db.partnerTimeline.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ eventType: 'CONTACT_ADDED', actorId: 'pu-1' }),
    );
  });

  it('refuses an email that is already this partner’s contact, on the email field', async () => {
    const { service, db } = harness({
      existingContact: { id: 'c0', partnerId: 'partner-1' },
    });
    const failure = await service
      .createContact(
        'partner-1',
        { firstName: 'Ada', lastName: 'L', email: 'ada@example.com' },
        'pu-1',
      )
      .catch(
        (error: unknown) => error as { errorCode: string; details: unknown },
      );
    expect(failure.errorCode).toBe('PARTNER_CONTACT_EMAIL_IN_USE');
    expect(failure.details).toEqual({
      fieldErrors: [
        {
          field: 'email',
          message: 'ada@example.com is already a contact of Contoso.',
        },
      ],
    });
    expect(db.partnerPortalUser.create).not.toHaveBeenCalled();
  });

  it('refuses an email held by another partner without naming that partner', async () => {
    const { service } = harness({
      existingContact: { id: 'c0', partnerId: 'partner-2' },
    });
    await expect(
      service.createContact(
        'partner-1',
        { firstName: 'Ada', lastName: 'L', email: 'ada@example.com' },
        'pu-1',
      ),
    ).rejects.toThrow(
      "ada@example.com is already used by another partner's contact.",
    );
  });

  it('turns a concurrent duplicate into the same named refusal', async () => {
    const { service } = harness({
      createError: new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    });
    await expect(
      service.createContact(
        'partner-1',
        { firstName: 'Ada', lastName: 'L', email: 'ada@example.com' },
        'pu-1',
      ),
    ).rejects.toMatchObject({ errorCode: 'PARTNER_CONTACT_EMAIL_IN_USE' });
  });

  it('requires partners.manage', () => {
    const { service } = harness();
    const reader = {
      userId: 'pu-1',
      permissionKeys: ['partners.read'],
      platform: { id: 'p1', role: 'MEMBER', permissionKeys: ['partners.read'] },
    } as unknown as AuthenticatedUser;
    expect(() =>
      service.createContactForUser(reader, 'partner-1', {
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.c',
      }),
    ).toThrow('Partner management access is required.');
  });
});

describe('the runtime routes partner notes and timeline to the partner service', () => {
  function runtime() {
    const partners = {
      addNote: jest.fn(async () => ({ id: 'entry-1' })),
      timeline: jest.fn(async () => ({ items: [{ id: 'entry-1' }] })),
    };
    const audit = { log: jest.fn(), listRecordTimeline: jest.fn() };
    const service = new PlatformRuntimeService(
      {} as never,
      {} as never,
      partners as never,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, partners, audit };
  }
  const owner = {
    userId: 'pu-1',
    tenantId: 'platform',
    roleKeys: [],
    permissionKeys: [],
    platform: {
      id: 'p1',
      role: 'PLATFORM_OWNER',
      permissionKeys: ['platform.*'],
    },
  } as unknown as AuthenticatedUser;

  it('writes a partner note as a timeline entry, not an audit-only row', async () => {
    const { service, partners, audit } = runtime();
    await expect(
      service.addTimeline(owner, 'partners', 'partner-1', {
        activityType: 'NOTE',
        message: 'Hello',
      }),
    ).resolves.toEqual({ success: true, message: 'Note added.' });
    expect(partners.addNote).toHaveBeenCalledWith('partner-1', 'Hello', 'pu-1');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('reads the partner timeline from the partner service', async () => {
    const { service, partners } = runtime();
    await expect(
      service.timeline(owner, 'partners', 'partner-1'),
    ).resolves.toEqual({
      items: [{ id: 'entry-1' }],
    });
    expect(partners.timeline).toHaveBeenCalledWith('partner-1');
  });
});
