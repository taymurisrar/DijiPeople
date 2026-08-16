import { LeadInquiryIntent } from '@prisma/client';
import {
  COMPANY_SIZE_OPTIONS,
  CURRENT_PRIVACY_NOTICE_VERSION,
  LEAD_INQUIRY_INTENT_OPTIONS,
  PARTNERSHIP_MODEL_OPTIONS,
  isLeadInquiryIntent,
  isPartnershipModel,
} from './acquisition.catalog';
import { LeadsService } from './leads.service';
import { SubmitLeadDto } from './dto/submit-lead.dto';

/**
 * REGRESSION — BUG-0021: the public contact form fabricated Lead data.
 *
 * It sent `industry: 'General HR operations'` (which was actually the visitor's
 * *interest area*), `companySize: 'Unknown'`, and `lastName: 'Contact'` when a
 * visitor gave one name — because those columns were required and the form does
 * not ask for them. The service then hardcoded `subStatus: 'Demo requested'` on
 * every lead regardless of what was asked.
 *
 * These pin that a Lead now records what the visitor actually said, and nothing
 * more.
 */
describe('public lead acquisition', () => {
  function buildService() {
    const created: Record<string, unknown>[] = [];

    const repository = {
      create: jest.fn(async (data: Record<string, unknown>) => {
        created.push(data);
        return { id: 'lead-1', companyName: data.companyName, ...data };
      }),
    };

    const prisma = {
      lead: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
      partnerReferralLink: { update: jest.fn(), findUnique: jest.fn() },
      partnerTimeline: { create: jest.fn() },
      platformUser: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const events = { record: jest.fn() };

    // Order matches the real constructor: repository, audit, prisma,
    // communications, events.
    const service = new LeadsService(
      repository as never,
      { log: jest.fn() } as never,
      prisma as never,
      { sendLeadSubmitted: jest.fn(), send: jest.fn() } as never,
      events as never,
    );

    return { service, created, prisma, events, repository };
  }

  function baseDto(overrides: Partial<SubmitLeadDto> = {}): SubmitLeadDto {
    return {
      firstName: 'Aisha',
      lastName: 'Khan',
      companyName: 'Acme Textiles',
      workEmail: 'aisha@acme.example',
      ...overrides,
    } as SubmitLeadDto;
  }

  // ---------------------------------------------------------------------
  // No fabrication
  // ---------------------------------------------------------------------

  it('leaves industry and company size null when the visitor did not give them', async () => {
    const { service, created } = buildService();

    await service.submitLead(baseDto(), 'corr-1');

    expect(created[0].industry).toBeNull();
    expect(created[0].companySize).toBeNull();
    // The specific invented values from BUG-0021.
    expect(created[0].industry).not.toBe('General HR operations');
    expect(created[0].companySize).not.toBe('Unknown');
  });

  it('does not write the interest area into the industry or plan field', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      baseDto({ interestAreas: ['payroll', 'attendance'] }),
      'corr-2',
    );

    expect(created[0].industry).toBeNull();
    expect(created[0].interestedPlan).toBeNull();
    expect(created[0].interestAreas).toEqual(['payroll', 'attendance']);
  });

  it('derives the sub-status from the stated intent instead of hardcoding it', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      baseDto({ inquiryIntent: LeadInquiryIntent.PRICING }),
      'corr-3',
    );

    expect(created[0].subStatus).toBe('Pricing or subscription');
    expect(created[0].subStatus).not.toBe('Demo requested');
  });

  it('leaves the sub-status null rather than inventing one when no intent is given', async () => {
    const { service, created } = buildService();

    await service.submitLead(baseDto(), 'corr-4');

    expect(created[0].subStatus).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Interest areas are validated against the real catalogue
  // ---------------------------------------------------------------------

  it('keeps only interest areas that name a real capability', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      baseDto({
        interestAreas: ['payroll', 'not-a-real-module', 'attendance'],
      }),
      'corr-5',
    );

    expect(created[0].interestAreas).toEqual(['payroll', 'attendance']);
  });

  it('drops unknown areas rather than rejecting the whole inquiry', async () => {
    // A stale bookmark should not stop someone contacting us.
    const { service, created } = buildService();

    await expect(
      service.submitLead(baseDto({ interestAreas: ['nonsense'] }), 'corr-6'),
    ).resolves.toMatchObject({ submitted: true });

    expect(created[0].interestAreas).toEqual([]);
  });

  it('de-duplicates repeated interest areas', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      baseDto({ interestAreas: ['payroll', 'payroll'] }),
      'corr-7',
    );

    expect(created[0].interestAreas).toEqual(['payroll']);
  });

  // ---------------------------------------------------------------------
  // Attribution
  // ---------------------------------------------------------------------

  it('persists attribution exactly as captured', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      baseDto({
        sourcePage: '/plans',
        referrerUrl: 'https://www.google.com/',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'launch-pk',
      }),
      'corr-8',
    );

    expect(created[0]).toMatchObject({
      sourcePage: '/plans',
      referrerUrl: 'https://www.google.com/',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'launch-pk',
      correlationId: 'corr-8',
    });
  });

  it('leaves absent UTM values null rather than defaulting them', async () => {
    // A default would corrupt campaign reporting by attributing organic
    // traffic to a campaign nobody ran.
    const { service, created } = buildService();

    await service.submitLead(baseDto(), 'corr-9');

    expect(created[0].utmSource).toBeNull();
    expect(created[0].utmCampaign).toBeNull();
    expect(created[0].referrerUrl).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Consent — acknowledgement and marketing are separate
  // ---------------------------------------------------------------------

  it('records the notice version the server had, not one the client sent', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      { ...baseDto(), privacyNoticeVersion: 'attacker-supplied' } as never,
      'corr-10',
    );

    expect(created[0].privacyNoticeVersion).toBe(
      CURRENT_PRIVACY_NOTICE_VERSION,
    );
    expect(created[0].privacyNoticeAcceptedAt).toBeInstanceOf(Date);
  });

  it('submits successfully without marketing consent', async () => {
    const { service, created } = buildService();

    await expect(
      service.submitLead(baseDto(), 'corr-11'),
    ).resolves.toMatchObject({
      submitted: true,
    });

    expect(created[0].marketingConsent).toBe(false);
    expect(created[0].marketingConsentAt).toBeNull();
  });

  it('records marketing consent with its timestamp when given', async () => {
    const { service, created } = buildService();

    await service.submitLead(baseDto({ marketingConsent: true }), 'corr-12');

    expect(created[0].marketingConsent).toBe(true);
    expect(created[0].marketingConsentAt).toBeInstanceOf(Date);
  });

  it('treats a missing marketing flag as declined, never as consent', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      baseDto({ marketingConsent: undefined }),
      'corr-13',
    );

    expect(created[0].marketingConsent).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------

  it('absorbs a repeated submission without creating a second lead', async () => {
    const { service, prisma, repository } = buildService();
    prisma.lead.findUnique.mockResolvedValueOnce({ id: 'existing-lead' });

    const result = await service.submitLead(baseDto(), 'corr-14');

    // Indistinguishable from success: a visitor who double-clicked should not
    // be shown an error about duplicates.
    expect(result).toMatchObject({ submitted: true, id: 'existing-lead' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('gives different questions different hashes, so a later inquiry is a new lead', async () => {
    const { service, created } = buildService();

    await service.submitLead(
      baseDto({ inquiryIntent: LeadInquiryIntent.PRICING }),
      'corr-15',
    );
    await service.submitLead(
      baseDto({ inquiryIntent: LeadInquiryIntent.PAYROLL }),
      'corr-16',
    );

    expect(created[0].submissionHash).not.toBe(created[1].submissionHash);
  });

  // ---------------------------------------------------------------------
  // Honeypot and events
  // ---------------------------------------------------------------------

  it('silently drops a honeypot submission without creating anything', async () => {
    const { service, repository } = buildService();

    const result = await service.submitLead(
      baseDto({ website: 'http://spam.example' }),
      'corr-17',
    );

    expect(result).toEqual({ submitted: true });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('emits a business event carrying the acquisition context', async () => {
    const { service, events } = buildService();

    await service.submitLead(
      baseDto({
        inquiryIntent: LeadInquiryIntent.PRICING,
        interestAreas: ['payroll'],
        sourcePage: '/plans',
      }),
      'corr-18',
    );

    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: 'LEAD_SUBMITTED',
        correlationId: 'corr-18',
        metadata: expect.objectContaining({
          inquiryIntent: LeadInquiryIntent.PRICING,
          interestAreas: ['payroll'],
          sourcePage: '/plans',
          marketingConsent: false,
        }),
      }),
    );
  });
});

describe('acquisition catalogue', () => {
  it('offers only intents the database can store', () => {
    for (const option of LEAD_INQUIRY_INTENT_OPTIONS) {
      expect(Object.values(LeadInquiryIntent)).toContain(option.value);
    }
  });

  it('covers every intent the enum defines, so none is unreachable', () => {
    const offered = new Set(LEAD_INQUIRY_INTENT_OPTIONS.map((o) => o.value));
    for (const value of Object.values(LeadInquiryIntent)) {
      expect(offered.has(value)).toBe(true);
    }
  });

  it('validates membership', () => {
    expect(isLeadInquiryIntent('PRICING')).toBe(true);
    expect(isLeadInquiryIntent('NOT_A_THING')).toBe(false);
    expect(isPartnershipModel('REFERRAL')).toBe(true);
    expect(isPartnershipModel('COMPANY')).toBe(false);
  });

  it('gives every option a human label distinct from its enum value', () => {
    // A raw enum name shown to a visitor reads as a leaked implementation
    // detail — this is the check that keeps SCREAMING_SNAKE out of the UI.
    for (const option of [
      ...LEAD_INQUIRY_INTENT_OPTIONS,
      ...PARTNERSHIP_MODEL_OPTIONS,
      ...COMPANY_SIZE_OPTIONS,
    ]) {
      expect(option.label).toBeTruthy();
      expect(option.label).not.toBe(option.value);
      expect(option.label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});
