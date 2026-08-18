import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Platform workflow public journeys (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let signatureToken: string;
  let signatureRequestNumber: string;
  let signatureContractNumber: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    /*
     * ITEM-0047 — this used to require a customer account literally named
     * 'Crescent Retail Group'. No seed produces that name; `seed:demo` creates
     * 'DijiPeople Demo Company'. The test was written against a developer's own
     * database and could never pass on a freshly seeded one, so all five cases
     * errored in `beforeAll` on every CI run.
     *
     * The name was never the point — it is only interpolated into sample
     * contract HTML. Any customer account will do.
     */
    const [customer, operator] = await Promise.all([
      prisma.customerAccount.findFirstOrThrow({
        orderBy: { createdAt: 'asc' },
      }),
      prisma.platformUser.findFirstOrThrow({ where: { status: 'ACTIVE' } }),
    ]);
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    signatureToken = `e2e-customer-signature-${unique}`;
    signatureRequestNumber = `SIG-E2E-${unique}`;
    signatureContractNumber = `CA-E2E-${unique}`;
    const contentHtml = `<h1>Customer agreement</h1><p>DijiPeople will provide platform services to ${customer.companyName}.</p>`;
    const contract = await prisma.contract.create({
      data: {
        contractNumber: signatureContractNumber,
        title: 'Crescent Retail E2E Customer Agreement',
        contractType: 'CUSTOMER_AGREEMENT',
        status: 'SIGNATURE_IN_PROGRESS',
        processStage: 'SIGNATURE_IN_PROGRESS',
        customerAccountId: customer.id,
        ownerPlatformUserId: operator.id,
        counterpartyName: customer.companyName,
        counterpartyEmail: customer.contactEmail,
        currencyCode: 'SAR',
        contractValue: 48000,
        currentVersionNumber: 1,
        createdById: operator.id,
        updatedById: operator.id,
      },
    });
    const version = await prisma.contractVersion.create({
      data: {
        contractId: contract.id,
        version: 1,
        status: 'SENT_FOR_SIGNATURE',
        title: contract.title,
        contentHtml,
        contentText: `DijiPeople will provide platform services to ${customer.companyName}.`,
        contentSha256: createHash('sha256').update(contentHtml).digest('hex'),
        createdById: operator.id,
      },
    });
    const signatureRequest = await prisma.signatureRequest.create({
      data: {
        requestNumber: signatureRequestNumber,
        contractId: contract.id,
        contractVersionId: version.id,
        status: 'SENT',
        subject: 'Crescent Retail E2E customer agreement',
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        sentAt: new Date(),
        createdById: operator.id,
      },
    });
    const recipient = await prisma.signatureRecipient.create({
      data: {
        signatureRequestId: signatureRequest.id,
        name: 'Sara Customer',
        email: customer.contactEmail,
        role: 'Customer authorized signatory',
        status: 'SENT',
        accessTokenHash: createHash('sha256')
          .update(signatureToken)
          .digest('hex'),
        tokenExpiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    await prisma.signatureEvent.create({
      data: {
        signatureRequestId: signatureRequest.id,
        recipientId: recipient.id,
        eventType: 'SENT',
        eventSequence: 1,
        eventHash: createHash('sha256')
          .update(`${signatureRequest.id}:sent`)
          .digest('hex'),
        authenticationMethod: 'SECURE_TOKEN',
        verificationStatus: 'TOKEN_ISSUED',
      },
    });
  });

  it('opens a persisted partner onboarding invitation by its secure token', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/partners/onboarding/seed-horizon-onboarding')
      .expect(200);
    expect(response.body).toMatchObject({
      partner: { displayName: 'Horizon People Advisory' },
    });
    expect(['IN_PROGRESS', 'SUBMITTED']).toContain(response.body.status);
  });

  it('submits the secure partner onboarding form into the admin review lifecycle', async () => {
    const response = await request(app.getHttpServer())
      .post('/public/partners/onboarding/seed-horizon-onboarding')
      .send({
        data: {
          legalName: 'Horizon People Advisory LLC',
          registrationNumber: 'HPA-2026-1044',
          registeredAddress: 'King Fahd Road, Riyadh, Saudi Arabia',
          authorizedSigner: 'Layla Al-Harbi',
          primaryContact: 'Layla Al-Harbi',
          financeContact: 'Omar Faris',
          operatingCountries: ['Saudi Arabia', 'United Arab Emirates'],
          taxInformation: 'VAT registration verified',
          bankingInformation: 'Payout account supplied for restricted review',
          complianceDeclarations: true,
          privacyConsent: true,
        },
      })
      .expect(201);
    expect(response.body).toMatchObject({ success: true });
    const stored = await prisma.partnerOnboardingApplication.findFirst({
      where: { partner: { displayName: 'Horizon People Advisory' } },
      orderBy: { updatedAt: 'desc' },
    });
    expect(stored?.status).toBe('SUBMITTED');
  });

  it('persists a public partner inquiry and returns its reference', async () => {
    const response = await request(app.getHttpServer())
      .post('/public/partners/inquiries')
      .send({
        type: 'COMPANY',
        companyName: 'E2E Referral Advisory',
        contactFirstName: 'Test',
        contactLastName: 'Partner',
        email: 'partner-workflow-e2e@example.test',
        country: 'Saudi Arabia',
        message: 'Enterprise partner workflow verification.',
        consentAccepted: true,
        source: 'e2e-suite',
      })
      .expect(201);
    expect(response.body.referenceNumber).toMatch(/^PIN-/);
  });

  it('opens a seeded customer agreement and records its viewed state', async () => {
    const response = await request(app.getHttpServer())
      .get(`/public/signatures/${signatureToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      requestNumber: signatureRequestNumber,
      contract: { contractNumber: signatureContractNumber },
      canSign: true,
    });
    expect(response.body.document.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('completes a customer signature, stores final evidence, and enforces database immutability', async () => {
    await request(app.getHttpServer())
      .post(`/public/signatures/${signatureToken}/sign`)
      .send({
        method: 'TYPED',
        typedName: 'Sara Customer',
        consentAccepted: true,
        consentText: 'I consent to use an electronic signature.',
        timezone: 'Asia/Riyadh',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ success: true, completed: true });
      });

    const requestRow = await prisma.signatureRequest.findUniqueOrThrow({
      where: { requestNumber: signatureRequestNumber },
      include: {
        contractVersion: true,
        signedDocument: true,
        evidenceDocument: true,
      },
    });
    expect(requestRow.status).toBe('COMPLETED');
    expect(requestRow.contractVersion.status).toBe('SIGNED');
    expect(requestRow.signedDocument?.isImmutable).toBe(true);
    expect(requestRow.evidenceDocument?.isImmutable).toBe(true);
    await expect(
      prisma.contractVersion.update({
        where: { id: requestRow.contractVersionId },
        data: { title: 'Illegal signed-version edit' },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  afterAll(async () => {
    await app.close();
  });
});
