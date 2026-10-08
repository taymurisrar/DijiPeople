import { commissionReferenceLabels } from './partner-commission-lifecycle';
import { PartnersService } from './partners.service';

/*
 * TASK-0037 browser pass, P4. The commission record's Lead and Customer fields
 * read `leadLabel`/`customerLabel` from the commission read; a read-only
 * lookup has no option list to resolve an id against, so without them the
 * record said "Not set" beside a lead the partner grid named.
 */

describe('commissionReferenceLabels', () => {
  const names = {
    leads: new Map([['lead-1', 'Prospect Trading LLC']]),
    customers: new Map([['cust-1', 'Contoso Customer']]),
  };

  it('names the cited lead and customer', () => {
    expect(
      commissionReferenceLabels(
        { leadId: 'lead-1', customerAccountId: 'cust-1' },
        names,
      ),
    ).toEqual({
      leadLabel: 'Prospect Trading LLC',
      customerLabel: 'Contoso Customer',
    });
  });

  it('is null when nothing is cited or the row is gone, never the raw id', () => {
    expect(commissionReferenceLabels({}, names)).toEqual({
      leadLabel: null,
      customerLabel: null,
    });
    expect(commissionReferenceLabels({ leadId: 'lead-gone' }, names)).toEqual({
      leadLabel: null,
      customerLabel: null,
    });
  });
});

describe('PartnersService.describeCommissions', () => {
  it('returns the lead and customer labels with each commission', async () => {
    const prisma = {
      lead: {
        findMany: jest.fn(async () => [
          { id: 'lead-1', companyName: 'Prospect Trading LLC' },
        ]),
      },
      customerAccount: {
        findMany: jest.fn(async () => [
          { id: 'cust-1', companyName: 'Contoso Customer' },
        ]),
      },
      invoice: { findMany: jest.fn(async () => []) },
    };
    const service = Object.create(PartnersService.prototype) as PartnersService;
    Object.assign(service, { prisma });
    const [described] = await service.describeCommissions([
      {
        id: 'com-1',
        leadId: 'lead-1',
        customerAccountId: 'cust-1',
        invoiceId: null,
        baseAmount: 1000,
        commissionRate: 10,
        commissionAmount: 100,
      },
    ]);
    expect(described).toMatchObject({
      id: 'com-1',
      leadId: 'lead-1',
      leadLabel: 'Prospect Trading LLC',
      customerLabel: 'Contoso Customer',
      sourceLabel: 'Customer Contoso Customer',
    });
  });
});
