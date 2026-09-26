import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/common/storage/storage.service';
import { describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * ITEM-0200 (b) — the partner and lead commercial funnel over real HTTP.
 *
 * Until this suite, the only lifecycle-level proof of this funnel was a
 * one-off HTTP+SQL harness run for a QA report
 * (`docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md`). Every
 * defect found in these modules since was found by reading code, not by a
 * failing test. This drives the funnel end to end, through the routes the
 * landing site, the admin console and a signer actually call:
 *
 *   public inquiry → qualification → partner agreement executed by public
 *   signature → onboarding invitation → public onboarding submission →
 *   review → activation → default referral link → public lead attributed by
 *   referral code → manual attribution correction
 *
 * alongside the admin create path's type rules (BUG-3549) and duplicate guard
 * (BUG-3550), the ACTIVE-only rule for manual attribution, and the
 * READ_ONLY_AUDITOR role being refused on every write it can reach.
 *
 * Nothing here borrows seeded partners or leads. The only seeded inputs are
 * the platform settings and system contract templates `seed:config` installs,
 * which CI runs inside `verify-database.mjs`.
 *
 * ## Cleanup, and what cannot be cleaned
 *
 * Operators, leads (with their attribution history) and the two admin-created
 * partners are removed; the partners go through the product's own guarded
 * delete. The funnel partner is NOT: it carries an executed agreement whose
 * `ContractVersion`, `ContractDocument` and `SignatureEvidence` rows are
 * protected by database triggers that refuse DELETE, with every other
 * reference to it `onDelete: Restrict`. That refusal is a legal guarantee, not
 * a fixture inconvenience, so it is retained — uniquely named per run, in a
 * database CI discards. Its stored document bytes are removed.
 */
describeWithDatabase()('Partner and lead commercial funnel (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: StorageService;
  let actors: HttpActors;

  let admin: HttpActor;
  let auditor: HttpActor;
  let presales: HttpActor;

  const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const upper = runId.toUpperCase().replace(/[^A-Z0-9]/g, '');

  /** Partners that have no history and so can be deleted through the API. */
  const deletablePartnerIds: string[] = [];
  const leadIds: string[] = [];
  let agreementId: string | undefined;

  let companyPartnerId: string;
  let individualPartnerId: string;

  // The funnel partner, from public inquiry to ACTIVE.
  const funnelCompany = `Funnel Advisory ${runId}`;
  const funnelEmail = `funnel-${runId}@example.invalid`;
  let funnelPartnerId: string;
  let onboardingApplicationId: string;
  let referralCode: string;

  const drawnSignature =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  const http = () => request(app.getHttpServer());
  const as = (actor: HttpActor) => ({
    Authorization: `Bearer ${actor.token}`,
    'X-DijiPeople-App': actor.client,
  });

  interface PartnerBody {
    id: string;
    type: string;
    status: string;
    email: string;
  }
  interface LeadBody {
    id: string;
    partnerId: string | null;
    partnerReferralLinkId: string | null;
    attributionStatus: string;
    attributionUnchanged?: boolean;
  }

  async function getPartner(id: string): Promise<PartnerBody> {
    const response = await http()
      .get(`/api/partners/${id}`)
      .set(as(admin))
      .expect(200);
    return response.body as PartnerBody;
  }

  async function getLead(id: string): Promise<LeadBody> {
    const response = await http()
      .get(`/api/super-admin/leads/${id}`)
      .set(as(admin))
      .expect(200);
    return response.body as LeadBody;
  }

  function adminLead(label: string) {
    return {
      contactFirstName: 'Funnel',
      contactLastName: label,
      companyName: `Lead Co ${label} ${runId}`,
      workEmail: `lead-${label}-${runId}@example.invalid`,
      industry: 'Technology',
      companySize: '51-200',
    };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    actors = new HttpActors(app, runId);

    admin = await actors.platformUser('PLATFORM_ADMIN', 'funnel-admin');
    auditor = await actors.platformUser('READ_ONLY_AUDITOR', 'funnel-auditor');
    presales = await actors.platformUser('PRESALES_MANAGER', 'funnel-presales');
  });

  afterAll(async () => {
    // Leads first: attribution corrections hold Restrict references to both
    // the lead and the partners, so they must go before either.
    if (leadIds.length > 0) {
      await prisma.leadAttributionCorrection.deleteMany({
        where: { leadId: { in: leadIds } },
      });
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    }

    // Through the product's guarded delete: it refuses a partner with any
    // history, so a success here also proves these two acquired none.
    if (deletablePartnerIds.length > 0 && admin) {
      const response = await http()
        .post('/api/platform-runtime/partners/actions/bulk-delete')
        .set(as(admin))
        .send({ ids: deletablePartnerIds });
      if (response.status >= 400) {
        throw new Error(
          `Partner cleanup failed (${response.status}): ${JSON.stringify(response.body)}`,
        );
      }
    }

    if (agreementId) {
      const [documents, evidence] = await Promise.all([
        prisma.contractDocument.findMany({
          where: { contractId: agreementId },
          select: { storageKey: true },
        }),
        prisma.signatureEvidence.findMany({
          where: {
            recipient: { signatureRequest: { contractId: agreementId } },
          },
          select: { signatureStorageKey: true },
        }),
      ]);
      const keys = [
        ...documents.map((row) => row.storageKey),
        ...evidence.map((row) => row.signatureStorageKey),
      ].filter((key): key is string => Boolean(key));
      for (const key of keys) {
        await storage.deleteFile(key, { kind: 'platform' });
      }
    }

    await actors?.cleanup();
    await app?.close();
  });

  describe('admin partner creation', () => {
    it('refuses a COMPANY partner without a company name (400)', async () => {
      await http()
        .post('/api/partners')
        .set(as(admin))
        .send({
          type: 'COMPANY',
          displayName: `No Company ${runId}`,
          email: `no-company-${runId}@example.invalid`,
          defaultCommissionRate: 10,
        })
        .expect(400);
    });

    it('refuses an INDIVIDUAL partner without a contact name (400)', async () => {
      await http()
        .post('/api/partners')
        .set(as(admin))
        .send({
          type: 'INDIVIDUAL',
          displayName: `No Name ${runId}`,
          email: `no-name-${runId}@example.invalid`,
          defaultCommissionRate: 10,
        })
        .expect(400);
    });

    it('creates a COMPANY partner as a draft', async () => {
      const response = await http()
        .post('/api/partners')
        .set(as(admin))
        .send({
          type: 'COMPANY',
          displayName: `Company Partner ${runId}`,
          companyName: `Company Partner ${runId}`,
          email: `company-${runId}@example.invalid`,
          defaultCommissionRate: 10,
        })
        .expect(201);
      const partner = response.body as PartnerBody;
      companyPartnerId = partner.id;
      deletablePartnerIds.push(partner.id);
      expect(partner).toMatchObject({ type: 'COMPANY', status: 'DRAFT' });
    });

    it('creates an INDIVIDUAL partner as a draft', async () => {
      const response = await http()
        .post('/api/partners')
        .set(as(admin))
        .send({
          type: 'INDIVIDUAL',
          displayName: `Individual Partner ${runId}`,
          contactFirstName: 'Individual',
          contactLastName: `Partner ${runId}`,
          email: `individual-${runId}@example.invalid`,
          defaultCommissionRate: 10,
        })
        .expect(201);
      const partner = response.body as PartnerBody;
      individualPartnerId = partner.id;
      deletablePartnerIds.push(partner.id);
      expect(partner).toMatchObject({ type: 'INDIVIDUAL', status: 'DRAFT' });
    });

    it('refuses a second partner with the same email, whatever its case (409)', async () => {
      await http()
        .post('/api/partners')
        .set(as(admin))
        .send({
          type: 'COMPANY',
          displayName: `Duplicate ${runId}`,
          companyName: `Duplicate Co ${runId}`,
          email: `COMPANY-${runId}@EXAMPLE.INVALID`,
          defaultCommissionRate: 10,
        })
        .expect(409);
    });
  });

  describe('from public inquiry to an ACTIVE partner', () => {
    it('accepts a public partner inquiry without a session', async () => {
      const response = await http()
        .post('/api/public/partners/inquiries')
        .send({
          type: 'COMPANY',
          companyName: funnelCompany,
          contactFirstName: 'Layla',
          contactLastName: `Funnel ${runId}`,
          email: funnelEmail,
          country: 'Saudi Arabia',
          consentAccepted: true,
        })
        .expect(201);
      const { referenceNumber } = response.body as { referenceNumber: string };
      expect(referenceNumber).toBeTruthy();

      // The public response carries only a reference number, by design: an
      // anonymous caller must not learn internal ids. The admin side resolves
      // it, which is what this read stands in for.
      const inquiry = await prisma.partnerInquiry.findFirstOrThrow({
        where: { referenceNumber },
        select: { partnerId: true },
      });
      expect(inquiry.partnerId).toBeTruthy();
      funnelPartnerId = inquiry.partnerId!;
    });

    it('qualifies the inquiry into a partner awaiting its agreement', async () => {
      const inquiry = await prisma.partnerInquiry.findFirstOrThrow({
        where: { partnerId: funnelPartnerId },
        select: { id: true },
      });
      await http()
        .post(`/api/partner-experience/inquiries/${inquiry.id}/qualify`)
        .set(as(auditor))
        .send({ notes: 'An auditor may not qualify.' })
        .expect(403);

      await http()
        .post(`/api/partner-experience/inquiries/${inquiry.id}/qualify`)
        .set(as(admin))
        .send({ notes: `Qualified by the e2e suite (${runId}).` })
        .expect(201);
      expect((await getPartner(funnelPartnerId)).status).toBe(
        'APPROVED_AWAITING_AGREEMENT',
      );
    });

    it('refuses the onboarding invitation before the agreement is executed (400)', async () => {
      await http()
        .post(
          `/api/platform-runtime/partners/${funnelPartnerId}/actions/send-onboarding-link`,
        )
        .set(as(admin))
        .send({})
        .expect(400);
    });

    it('executes the master partner agreement through the public signing route', async () => {
      const templates = await http()
        .get('/api/contract-templates')
        .set(as(admin))
        .expect(200);
      const template = (
        templates.body as { items: Array<{ id: string; key: string }> }
      ).items.find((item) => item.key === 'PARTNER_COMPANY_STANDARD');
      if (!template) {
        throw new Error(
          'PARTNER_COMPANY_STANDARD is missing — seed:config has not run against this database.',
        );
      }

      const created = await http()
        .post('/api/contracts')
        .set(as(admin))
        .send({
          title: `Master partner agreement ${runId}`,
          contractType: 'MASTER_PARTNER_AGREEMENT',
          counterpartyName: funnelCompany,
          counterpartyEmail: funnelEmail,
          templateId: template.id,
          partnerId: funnelPartnerId,
        })
        .expect(201);
      agreementId = (created.body as { id: string }).id;

      const submitted = await http()
        .post(`/api/contracts/${agreementId}/submit-approval`)
        .set(as(admin))
        .expect(201);
      const approvalId = (submitted.body as { id?: string }).id;
      for (let step = 0; approvalId && step < 5; step += 1) {
        const current = await http()
          .get(`/api/contracts/${agreementId}`)
          .set(as(admin))
          .expect(200);
        if (
          (current.body as { status: string }).status === 'READY_FOR_SIGNATURE'
        )
          break;
        await http()
          .post(`/api/platform-approvals/${approvalId}/approve`)
          .set(as(admin))
          .send({ comment: 'Approved by the e2e suite.' })
          .expect(201);
      }

      const ready = await http()
        .get(`/api/contracts/${agreementId}`)
        .set(as(admin))
        .expect(200);
      const readyBody = ready.body as {
        status: string;
        parties: Array<{
          id: string;
          isSignatory: boolean;
          signatureRequired: boolean;
        }>;
      };
      expect(readyBody.status).toBe('READY_FOR_SIGNATURE');
      const signer = readyBody.parties.find(
        (party) => party.isSignatory && party.signatureRequired,
      );

      const sent = await http()
        .post(`/api/contracts/${agreementId}/signature-requests`)
        .set(as(admin))
        .send({
          subject: `Please sign ${runId}`,
          recipients: [
            {
              name: `Layla Funnel ${runId}`,
              email: funnelEmail,
              role: 'Authorized signatory',
              partyId: signer?.id,
            },
          ],
        })
        .expect(201);
      const token = (sent.body as { signingLinks: Array<{ token: string }> })
        .signingLinks[0].token;

      await http()
        .post(`/api/public/signatures/${token}/sign`)
        .send({
          method: 'DRAWN',
          signatureDataUrl: drawnSignature,
          consentAccepted: true,
          consentText: 'I agree to sign electronically.',
        })
        .expect(201);

      expect((await getPartner(funnelPartnerId)).status).toBe(
        'AGREEMENT_EXECUTED',
      );
    });

    it('invites, accepts and approves the onboarding submission', async () => {
      const invited = await http()
        .post(
          `/api/platform-runtime/partners/${funnelPartnerId}/actions/send-onboarding-link`,
        )
        .set(as(admin))
        .send({})
        .expect(201);
      const invitation = (
        invited.body as {
          data: { applicationId: string; onboardingToken: string };
        }
      ).data;
      onboardingApplicationId = invitation.applicationId;

      await http()
        .get(`/api/public/partners/onboarding/${invitation.onboardingToken}`)
        .expect(200);

      // Activation is refused while onboarding is unapproved.
      await http()
        .post(`/api/partner-experience/partners/${funnelPartnerId}/activate`)
        .set(as(admin))
        .expect(400);

      await http()
        .post(`/api/public/partners/onboarding/${invitation.onboardingToken}`)
        .send({
          data: {
            legalName: `${funnelCompany} LLC`,
            registrationNumber: `REG-${upper}`,
            registeredAddress: 'King Fahd Road, Riyadh',
            authorizedSigner: `Layla Funnel ${runId}`,
            taxInformation: { taxId: `TAX-${upper}` },
            bankingInformation: 'Supplied for restricted review',
            privacyConsent: true,
          },
        })
        .expect(201);
      expect((await getPartner(funnelPartnerId)).status).toBe('SUBMITTED');

      await http()
        .post(
          `/api/partner-experience/onboarding/${onboardingApplicationId}/approve`,
        )
        .set(as(auditor))
        .send({})
        .expect(403);
      await http()
        .post(
          `/api/partner-experience/onboarding/${onboardingApplicationId}/approve`,
        )
        .set(as(admin))
        .send({ notes: 'Approved by the e2e suite.' })
        .expect(201);
      expect((await getPartner(funnelPartnerId)).status).toBe(
        'INFORMATION_APPROVED',
      );
    });

    it('activates the partner, which then has a live default referral link', async () => {
      await http()
        .post(`/api/partner-experience/partners/${funnelPartnerId}/activate`)
        .set(as(admin))
        .expect(201);
      expect((await getPartner(funnelPartnerId)).status).toBe('ACTIVE');

      const links = await http()
        .get(`/api/partners/${funnelPartnerId}/referral-links`)
        .set(as(admin))
        .expect(200);
      const defaultLink = (
        links.body as {
          items: Array<{ code: string; isDefault: boolean; status: string }>;
        }
      ).items.find((link) => link.isDefault && link.status === 'ACTIVE');
      expect(defaultLink).toBeDefined();
      referralCode = defaultLink!.code;
    });
  });

  describe('leads and attribution', () => {
    it('attributes a public lead to the partner whose referral code it carries', async () => {
      const response = await http()
        .post('/api/public/leads')
        .send({
          referralCode,
          firstName: 'Referred',
          lastName: `Buyer ${runId}`,
          companyName: `Referred Co ${runId}`,
          workEmail: `referred-${runId}@example.invalid`,
        })
        .expect(201);
      const { id } = response.body as { submitted: boolean; id: string };
      expect(id).toBeTruthy();
      leadIds.push(id);

      const lead = await getLead(id);
      expect(lead.partnerId).toBe(funnelPartnerId);
      expect(lead.attributionStatus).toBe('ATTRIBUTED');
    });

    it('lets a platform admin create a lead, and refuses the auditor (403)', async () => {
      await http()
        .post('/api/super-admin/leads')
        .set(as(auditor))
        .send(adminLead('auditor'))
        .expect(403);

      const response = await http()
        .post('/api/super-admin/leads')
        .set(as(admin))
        .send(adminLead('direct'))
        .expect(201);
      const lead = response.body as LeadBody;
      leadIds.push(lead.id);
      expect(lead.partnerId).toBeNull();
    });

    it('refuses an attribution correction by the auditor and by presales (403)', async () => {
      const [, directLeadId] = leadIds;
      for (const actor of [auditor, presales]) {
        await http()
          .patch(`/api/super-admin/leads/${directLeadId}/attribution`)
          .set(as(actor))
          .send({ partnerId: funnelPartnerId, reason: 'Not permitted.' })
          .expect(403);
      }
      expect((await getLead(directLeadId)).partnerId).toBeNull();
    });

    it('refuses to attribute a lead to a partner that is not ACTIVE (400)', async () => {
      const [, directLeadId] = leadIds;
      for (const inactivePartnerId of [individualPartnerId, companyPartnerId]) {
        await http()
          .patch(`/api/super-admin/leads/${directLeadId}/attribution`)
          .set(as(admin))
          .send({
            partnerId: inactivePartnerId,
            reason: 'The partner is still a draft.',
          })
          .expect(400);
      }
      expect((await getLead(directLeadId)).partnerId).toBeNull();
    });

    it('corrects the attribution to the ACTIVE partner and records why', async () => {
      const [, directLeadId] = leadIds;
      const reason = `Referred by phone (${runId}).`;
      await http()
        .patch(`/api/super-admin/leads/${directLeadId}/attribution`)
        .set(as(admin))
        .send({ partnerId: funnelPartnerId, reason })
        .expect(200);

      const lead = await getLead(directLeadId);
      expect(lead.partnerId).toBe(funnelPartnerId);
      expect(lead.attributionStatus).toBe('CORRECTED');

      const corrections = await prisma.leadAttributionCorrection.findMany({
        where: { leadId: directLeadId },
        select: {
          previousPartnerId: true,
          correctedPartnerId: true,
          reason: true,
          changedById: true,
        },
      });
      expect(corrections).toEqual([
        {
          previousPartnerId: null,
          correctedPartnerId: funnelPartnerId,
          reason,
          changedById: admin.id,
        },
      ]);
    });

    it('treats re-saving the same attribution as a no-op, not a second correction', async () => {
      const [, directLeadId] = leadIds;
      const response = await http()
        .patch(`/api/super-admin/leads/${directLeadId}/attribution`)
        .set(as(admin))
        .send({ partnerId: funnelPartnerId, reason: 'Saved again.' })
        .expect(200);
      expect((response.body as LeadBody).attributionUnchanged).toBe(true);
      expect(
        await prisma.leadAttributionCorrection.count({
          where: { leadId: directLeadId },
        }),
      ).toBe(1);
    });
  });

  describe('the read-only auditor', () => {
    it('can read a partner but not change one (403)', async () => {
      await http()
        .get(`/api/partners/${companyPartnerId}`)
        .set(as(auditor))
        .expect(200);

      await http()
        .post('/api/partners')
        .set(as(auditor))
        .send({
          type: 'COMPANY',
          displayName: `Auditor Co ${runId}`,
          companyName: `Auditor Co ${runId}`,
          email: `auditor-co-${runId}@example.invalid`,
          defaultCommissionRate: 10,
        })
        .expect(403);
      await http()
        .patch(`/api/partners/${companyPartnerId}`)
        .set(as(auditor))
        .send({ notes: 'An auditor may not edit.' })
        .expect(403);
      await http()
        .post(`/api/partners/${companyPartnerId}/lifecycle`)
        .set(as(auditor))
        .send({ action: 'reject', reason: 'An auditor may not decide.' })
        .expect(403);
      await http()
        .post(`/api/partner-experience/partners/${funnelPartnerId}/activate`)
        .set(as(auditor))
        .expect(403);
    });
  });
});
