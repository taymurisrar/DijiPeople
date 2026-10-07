import { PartnersService } from './partners.service';

/*
 * ADR-0026 D3 (EXECPLAN-0055 WP-06). The commission writes on the service:
 * what a new entry is recorded with, what is refused before anything is
 * written, and that every change is audited with its actor and written to the
 * partner's timeline.
 */

const ENABLED_QAR_USD = {
  currency: 'QAR',
  reportingCurrency: 'QAR',
  enabledCurrencies: ['QAR', 'USD'],
};

function commissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'com-1',
    partnerId: 'partner-1',
    leadId: null,
    customerAccountId: null,
    invoiceId: null,
    commissionNumber: 'COM-1',
    status: 'PENDING',
    baseAmount: 1000,
    commissionRate: 10,
    commissionAmount: 100,
    currencyCode: 'QAR',
    description: null,
    earnedAt: null,
    dueAt: null,
    paidAt: null,
    ...overrides,
  };
}

function harness(
  options: {
    partner?: Record<string, unknown> | null;
    commission?: Record<string, unknown> | null;
    lead?: Record<string, unknown> | null;
    updatedCount?: number;
  } = {},
) {
  const partner =
    options.partner === undefined
      ? {
          id: 'partner-1',
          displayName: 'Contoso',
          currencyCode: 'QAR',
          defaultCommissionRate: { toString: () => '12.5' },
        }
      : options.partner;
  let stored = options.commission ?? commissionRow();
  const db = {
    partner: { findUnique: jest.fn(async () => partner) },
    lead: { findUnique: jest.fn(async () => options.lead ?? null) },
    customerAccount: { findUnique: jest.fn(async () => null) },
    invoice: { findUnique: jest.fn(async () => null) },
    platformSetting: {
      findUnique: jest.fn(async () => ({ value: ENABLED_QAR_USD })),
    },
    partnerCommission: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'com-new',
        ...data,
      })),
      findFirst: jest.fn(async () => stored),
      updateMany: jest.fn(
        async ({ data }: { data: Record<string, unknown> }) => {
          if ((options.updatedCount ?? 1) === 1)
            stored = { ...stored, ...data };
          return { count: options.updatedCount ?? 1 };
        },
      ),
      findUniqueOrThrow: jest.fn(async () => stored),
    },
    partnerTimeline: { create: jest.fn(async () => ({})) },
  };
  // The transaction client is the same stub, so `tx` writes land on `db`.
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

const createData = (db: ReturnType<typeof harness>['db']) =>
  (
    db.partnerCommission.create.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >
  )[0][0].data;

const auditCall = (audit: ReturnType<typeof harness>['audit']) =>
  audit.log.mock.calls[0] as unknown as [Record<string, unknown>, unknown];

const timelineData = (db: ReturnType<typeof harness>['db']) =>
  (
    db.partnerTimeline.create.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >
  )[0][0].data;

describe('PartnersService.createCommission', () => {
  it("defaults the rate and currency to the partner's and computes the amount", async () => {
    const { service, db } = harness();

    const created = await service.createCommission(
      'partner-1',
      { baseAmount: 2000 } as never,
      'user-1',
    );

    const data = createData(db);
    expect(Number(data.commissionRate)).toBe(12.5);
    expect(Number(data.commissionAmount)).toBe(250);
    expect(data.currencyCode).toBe('QAR');
    expect(data.status).toBe('PENDING');
    expect(created).toMatchObject({
      commissionRate: 12.5,
      commissionAmount: 250,
      baseAmount: 2000,
    });
  });

  it('picks fields explicitly: a caller cannot set the amount, status or number', async () => {
    const { service, db } = harness();

    await service.createCommission(
      'partner-1',
      {
        baseAmount: 1000,
        commissionRate: 10,
        commissionAmount: 999_999,
        status: 'PAID',
        commissionNumber: 'MINE',
        paidAt: '2026-01-01',
        partnerId: 'partner-other',
      } as never,
      'user-1',
    );

    const data = createData(db);
    expect(Number(data.commissionAmount)).toBe(100);
    expect(data.status).toBe('PENDING');
    expect(data.commissionNumber).not.toBe('MINE');
    expect(data.partnerId).toBe('partner-1');
    expect(data).not.toHaveProperty('paidAt');
  });

  it('refuses an entry with no rate when the partner has no configured default', async () => {
    const { service, db } = harness({
      partner: {
        id: 'partner-1',
        displayName: 'Contoso',
        currencyCode: 'QAR',
        defaultCommissionRate: 0,
      },
    });

    await expect(
      service.createCommission('partner-1', { baseAmount: 10 } as never),
    ).rejects.toMatchObject({ errorCode: 'PARTNER_COMMISSION_RATE_REQUIRED' });
    expect(db.partnerCommission.create).not.toHaveBeenCalled();
  });

  it('refuses a currency that is not enabled, unless it is the partner’s own', async () => {
    const { service, db } = harness();
    await expect(
      service.createCommission('partner-1', {
        baseAmount: 10,
        currencyCode: 'EUR',
      } as never),
    ).rejects.toMatchObject({ errorCode: 'PLATFORM_CURRENCY_NOT_ENABLED' });
    expect(db.partnerCommission.create).not.toHaveBeenCalled();

    const own = harness({
      partner: {
        id: 'partner-1',
        displayName: 'Contoso',
        currencyCode: 'EUR',
        defaultCommissionRate: 10,
      },
    });
    await own.service.createCommission('partner-1', {
      baseAmount: 10,
      currencyCode: 'EUR',
    } as never);
    expect(createData(own.db).currencyCode).toBe('EUR');
  });

  it('refuses a lead another partner referred, and writes nothing', async () => {
    const { service, db, audit } = harness({
      lead: { id: 'lead-1', partnerId: 'partner-2' },
    });

    await expect(
      service.createCommission('partner-1', {
        baseAmount: 10,
        leadId: 'lead-1',
      } as never),
    ).rejects.toMatchObject({ errorCode: 'PARTNER_COMMISSION_LINK_INVALID' });
    expect(db.partnerCommission.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('is audited with the actor and written to the partner timeline', async () => {
    const { service, db, audit } = harness();

    await service.createCommission(
      'partner-1',
      { baseAmount: 1000, commissionRate: 10 } as never,
      'user-1',
    );

    const [entry, client] = auditCall(audit);
    expect(entry).toMatchObject({
      action: 'PARTNER_COMMISSION_CREATED',
      actorUserId: 'user-1',
      tenantId: 'platform',
      afterSnapshot: {
        commissionRate: 10,
        commissionAmount: 100,
        status: 'PENDING',
      },
    });
    // Inside the create's transaction, not after it.
    expect(client).toBe(db);
    expect(timelineData(db)).toMatchObject({
      partnerId: 'partner-1',
      eventType: 'COMMISSION_CREATED',
      actorId: 'user-1',
    });
  });
});

describe('PartnersService commission status', () => {
  it('approves a pending commission, audited and on the timeline', async () => {
    const { service, db, audit } = harness();

    await expect(
      service.commissionAction('com-1', 'approve-commission', 'user-1'),
    ).resolves.toMatchObject({ status: 'APPROVED' });

    expect(db.partnerCommission.updateMany).toHaveBeenCalledWith({
      where: { id: 'com-1', status: 'PENDING' },
      data: { status: 'APPROVED' },
    });
    const [entry, client] = auditCall(audit);
    expect(entry).toMatchObject({
      action: 'PARTNER_COMMISSION_APPROVED',
      actorUserId: 'user-1',
      beforeSnapshot: { status: 'PENDING' },
      afterSnapshot: { status: 'APPROVED' },
    });
    expect(client).toBe(db);
    expect(timelineData(db)).toMatchObject({
      eventType: 'COMMISSION_APPROVED',
    });
  });

  it('stamps paidAt when marked paid', async () => {
    const { service, db } = harness({
      commission: commissionRow({ status: 'PAYABLE' }),
    });

    await service.commissionAction('com-1', 'mark-commission-paid', 'user-1');

    const call = (
      db.partnerCommission.updateMany.mock.calls as unknown as Array<
        [{ data: Record<string, unknown> }]
      >
    )[0][0];
    expect(call.data.status).toBe('PAID');
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it('refuses PAID → PENDING through the PATCH body, and writes nothing', async () => {
    const { service, db, audit } = harness({
      commission: commissionRow({ status: 'PAID' }),
    });

    await expect(
      service.updateCommission('partner-1', 'com-1', {
        status: 'PENDING',
      } as never),
    ).rejects.toMatchObject({
      errorCode: 'PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED',
    });
    expect(db.partnerCommission.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('refuses voiding a paid commission', async () => {
    const { service } = harness({
      commission: commissionRow({ status: 'PAID' }),
    });
    await expect(
      service.commissionAction('com-1', 'void-commission', 'user-1', 'oops'),
    ).rejects.toMatchObject({
      errorCode: 'PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED',
    });
  });

  it('loses a race cleanly: a concurrent change matches no row and is refused', async () => {
    const { service, audit } = harness({ updatedCount: 0 });
    await expect(
      service.commissionAction('com-1', 'approve-commission', 'user-1'),
    ).rejects.toMatchObject({
      errorCode: 'PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED',
    });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('only finds a commission under the partner named in the PATCH route', async () => {
    const { service, db } = harness();
    await service.updateCommission('partner-1', 'com-1', {
      status: 'APPROVED',
    } as never);
    const [query] = db.partnerCommission.findFirst.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(query.where).toMatchObject({ id: 'com-1', partnerId: 'partner-1' });
  });
});
