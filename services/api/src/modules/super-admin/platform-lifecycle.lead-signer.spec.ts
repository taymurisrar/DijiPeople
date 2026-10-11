import { LeadStatus } from '@prisma/client';
import { PlatformLifecycleService } from './platform-lifecycle.service';

/*
 * WS05. A lead records its authorized signatory, and the lead source fills
 * `customer.primarySigner.*` from it. The customer the lead converted into had
 * nowhere to keep that signer, so the same company could sign a customer
 * agreement as a lead and was refused one as a customer. Conversion now carries
 * the signer across.
 *
 * Driven through the real `convertLeadToCustomer` up to the customer insert,
 * which is all this asserts; the transaction is stopped there on purpose
 * rather than stubbing the dozen collaborators the rest of conversion uses.
 */
const STOP = new Error('stop after the customer insert');

const LEAD = {
  id: 'lead-1',
  status: LeadStatus.QUALIFIED,
  isQualified: true,
  companyName: 'Xoult',
  legalCompanyName: 'Xoult Ltd',
  workEmail: 'omar@xoult.example',
  industry: 'Logistics',
  companySize: '51-200',
  contactFirstName: 'Omar',
  contactLastName: 'Saleh',
  authorizedSignerName: ' Amal Hassan ',
  authorizedSignerTitle: 'Chief Operating Officer',
  authorizedSignerEmail: 'Amal@Xoult.example',
  source: 'WEBSITE',
};

function convert(lead: Record<string, unknown>) {
  const create = jest.fn(() => Promise.reject(STOP));
  const prisma = {
    customerAccount: { findFirst: jest.fn(() => Promise.resolve(null)) },
    $transaction: jest.fn(
      (
        operation: (tx: {
          customerAccount: { create: typeof create };
        }) => unknown,
      ) => operation({ customerAccount: { create } }),
    ),
  };
  const service = new PlatformLifecycleService(
    prisma as never,
    {} as never,
    {} as never,
    { findById: jest.fn(() => Promise.resolve(lead)) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  Object.assign(service, {
    assertRequiredCustomerAgreements: jest.fn(() => Promise.resolve()),
    resolvePlatformOwnerId: jest.fn(() => Promise.resolve('owner-1')),
  });
  const actor = {
    userId: 'user-1',
    tenantId: 'platform',
    platform: { id: 'owner-1', role: 'SUPER_ADMIN' },
  } as never;
  return {
    run: () => service.convertLeadToCustomer(actor, 'lead-1', {} as never),
    create,
  };
}

describe('lead conversion carries the authorized signer', () => {
  it('copies the lead signer onto the new customer account', async () => {
    const { run, create } = convert(LEAD);

    await expect(run()).rejects.toBe(STOP);

    expect(insertedData(create)).toMatchObject({
      authorizedSignerName: 'Amal Hassan',
      authorizedSignerTitle: 'Chief Operating Officer',
      authorizedSignerEmail: 'amal@xoult.example',
    });
  });

  it('leaves the signer empty rather than promoting the contact', async () => {
    // Owner decision D3: the contact person is not assumed to be the signer.
    const { run, create } = convert({
      ...LEAD,
      authorizedSignerName: null,
      authorizedSignerTitle: null,
      authorizedSignerEmail: null,
    });

    await expect(run()).rejects.toBe(STOP);

    expect(insertedData(create)).toMatchObject({
      authorizedSignerName: null,
      authorizedSignerTitle: null,
      authorizedSignerEmail: null,
    });
  });
});

function insertedData(create: jest.Mock) {
  expect(create).toHaveBeenCalledTimes(1);
  const [args] = create.mock.calls[0] as unknown as [
    { data: Record<string, unknown> },
  ];
  return args.data;
}
