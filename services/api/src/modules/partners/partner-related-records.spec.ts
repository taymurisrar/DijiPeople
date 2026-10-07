import {
  describeAttributedTenant,
  describePartnerTimeline,
  describeReferredLead,
  leadAttributionSource,
  partnerReferralLinkUrl,
  withFullName,
} from './partner-related-records';

/*
 * EXECPLAN-0055 WP-08. The partner record's tabs declared columns the related
 * payload never filled. These are the values they read.
 */

describe('partnerReferralLinkUrl', () => {
  const env = {
    NODE_ENV: 'test',
    PUBLIC_SITE_URL: 'https://www.example.test',
  } as NodeJS.ProcessEnv;

  it('builds the public-site URL with the link target and its ref code', () => {
    expect(
      partnerReferralLinkUrl(
        { code: 'DP-P-ABC123', targetPath: '/pricing' },
        env,
      ),
    ).toBe('https://www.example.test/pricing?ref=DP-P-ABC123');
  });

  it('falls back to /request-demo for a missing or unsafe target', () => {
    expect(partnerReferralLinkUrl({ code: 'X1', targetPath: null }, env)).toBe(
      'https://www.example.test/request-demo?ref=X1',
    );
    expect(
      partnerReferralLinkUrl({ code: 'X1', targetPath: '//evil.test' }, env),
    ).toBe('https://www.example.test/request-demo?ref=X1');
  });

  it('encodes the code rather than trusting it', () => {
    expect(
      partnerReferralLinkUrl({ code: 'A&B', targetPath: '/request-demo' }, env),
    ).toBe('https://www.example.test/request-demo?ref=A%26B');
  });

  it('is null — never a loopback link — when production has no public site URL', () => {
    expect(
      partnerReferralLinkUrl({ code: 'X1', targetPath: '/request-demo' }, {
        APP_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});

describe('referred lead attribution source', () => {
  it('names a manual correction as such, ahead of any code', () => {
    expect(
      leadAttributionSource({
        attributionStatus: 'CORRECTED',
        partnerReferralLink: { code: 'DP-P-1' },
      }),
    ).toBe('Manual correction');
  });

  it('names the referral link, or the code captured at submission', () => {
    expect(
      leadAttributionSource({
        attributionStatus: 'ATTRIBUTED',
        partnerReferralLink: { code: 'DP-P-1' },
      }),
    ).toBe('Referral link DP-P-1');
    expect(
      leadAttributionSource({
        attributionStatus: 'ATTRIBUTED',
        partnerReferralLink: null,
        referralCodeSnapshot: 'OLD-9',
      }),
    ).toBe('Referral link OLD-9');
  });

  it('exposes the converted customer for the customer link column', () => {
    const lead = describeReferredLead({
      attributionStatus: 'ATTRIBUTED',
      convertedCustomers: [{ id: 'cust-1', companyName: 'Contoso' }],
    });
    expect(lead.convertedCustomerId).toBe('cust-1');
    expect(lead.convertedCustomerName).toBe('Contoso');
    expect(describeReferredLead({}).convertedCustomerId).toBeNull();
  });
});

describe('attributed tenant', () => {
  it('carries a display name and the customer the Tenants tab links to', () => {
    expect(
      describeAttributedTenant({
        name: 'contoso',
        displayName: null,
        customerAccount: { id: 'cust-1', companyName: 'Contoso' },
      }),
    ).toEqual(
      expect.objectContaining({
        displayName: 'contoso',
        customerAccountId: 'cust-1',
        customerName: 'Contoso',
      }),
    );
  });
});

describe('owner full name', () => {
  it('adds the fullName the Owner column reads', () => {
    expect(
      withFullName({ firstName: 'Ada', lastName: 'Lovelace', email: 'a@x' })
        ?.fullName,
    ).toBe('Ada Lovelace');
    expect(withFullName(null)).toBeNull();
  });
});

describe('describePartnerTimeline', () => {
  it('names the actor of each entry from the right user table', () => {
    const items = describePartnerTimeline(
      [
        {
          id: 't1',
          eventType: 'NOTE',
          actorType: 'PLATFORM_USER',
          actorId: 'pu-1',
          message: 'Called them.',
          createdAt: '2026-10-08T10:00:00.000Z',
        },
        {
          id: 't2',
          eventType: 'REFERRAL_LINK_CREATED',
          actorType: 'PARTNER_USER',
          actorId: 'portal-1',
          message: 'Link created.',
          createdAt: '2026-10-08T09:00:00.000Z',
        },
        {
          id: 't3',
          eventType: 'PARTNER_SUSPEND',
          actorType: 'PLATFORM_USER',
          actorId: 'gone',
          message: 'Suspended.',
          createdAt: '2026-10-08T08:00:00.000Z',
        },
      ],
      {
        platform: new Map([['pu-1', 'Ada Lovelace']]),
        portal: new Map([['portal-1', 'Grace Hopper']]),
      },
    );
    expect(items.map((item) => item.actorName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Platform user',
    ]);
    expect(items[0].actionLabel).toBe('Note');
    expect(items[1].actionLabel).toBe('Referral link created');
  });
});
