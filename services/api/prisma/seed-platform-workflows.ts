import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { createPrismaClient } from './create-prisma-client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = createPrismaClient();
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function main() {
  const operator = await prisma.platformUser.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!operator)
    throw new Error('Seed a Platform Admin user before platform workflows.');

  const currencySetting = await prisma.platformSetting.findUnique({
    where: { key: 'platform-defaults' },
  });
  const defaults = currencySetting?.value as Record<string, unknown> | null;
  const currency =
    (typeof defaults?.reportingCurrency === 'string'
      ? defaults.reportingCurrency
      : typeof defaults?.currency === 'string'
        ? defaults.currency
        : 'USD') ?? 'USD';
  const partnerTemplate = await prisma.contractTemplate.findUnique({
    where: {
      key_contractType: {
        key: 'PARTNER_REFERRAL_STANDARD',
        contractType: 'MASTER_PARTNER_AGREEMENT',
      },
    },
    include: { versions: { where: { version: 1 } } },
  });
  const customerTemplate = await prisma.contractTemplate.findUnique({
    where: {
      key_contractType: {
        key: 'CUSTOMER_SERVICE_STANDARD',
        contractType: 'SUBSCRIPTION_AGREEMENT',
      },
    },
    include: { versions: { where: { version: 1 } } },
  });
  if (!partnerTemplate || !customerTemplate)
    throw new Error('Run seed:config before platform workflow seeding.');

  const activePartner = await prisma.partner.upsert({
    where: { code: 'PTR-SEED-NORTHSTAR' },
    create: {
      code: 'PTR-SEED-NORTHSTAR',
      type: 'COMPANY',
      displayName: 'Northstar Growth Partners',
      companyName: 'Northstar Growth Partners LLC',
      contactFirstName: 'Nadia',
      contactLastName: 'Rahman',
      email: 'nadia.partner@example.test',
      phone: '+966500000120',
      country: 'Saudi Arabia',
      website: 'https://northstar.example.test',
      taxId: 'SEED-TAX-120',
      defaultCommissionRate: 12.5,
      currencyCode: currency,
      status: 'ACTIVE',
      assignedToUserId: operator.id,
      notes: 'Seeded active referral partner with a fully signed agreement.',
    },
    update: { assignedToUserId: operator.id },
  });
  const onboardingPartner = await prisma.partner.upsert({
    where: { code: 'PTR-SEED-BRIGHTPATH' },
    create: {
      code: 'PTR-SEED-BRIGHTPATH',
      type: 'COMPANY',
      displayName: 'BrightPath Advisory',
      companyName: 'BrightPath Advisory',
      contactFirstName: 'Omar',
      contactLastName: 'Saleh',
      email: 'omar.partner@example.test',
      country: 'United Arab Emirates',
      defaultCommissionRate: 10,
      currencyCode: currency,
      status: 'SUBMITTED',
      assignedToUserId: operator.id,
    },
    update: { assignedToUserId: operator.id },
  });
  const onboardingInProgressPartner = await prisma.partner.upsert({
    where: { code: 'PTR-SEED-HORIZON' },
    create: {
      code: 'PTR-SEED-HORIZON',
      type: 'COMPANY',
      displayName: 'Horizon People Advisory',
      companyName: 'Horizon People Advisory Ltd',
      contactFirstName: 'Mariam',
      contactLastName: 'Abbas',
      email: 'mariam.horizon@example.test',
      country: 'Bahrain',
      defaultCommissionRate: 9,
      currencyCode: currency,
      status: 'ONBOARDING_IN_PROGRESS',
      assignedToUserId: operator.id,
    },
    update: {
      status: 'ONBOARDING_IN_PROGRESS',
      assignedToUserId: operator.id,
    },
  });
  const draftingPartner = await prisma.partner.upsert({
    where: { code: 'PTR-SEED-CATALYST' },
    create: {
      code: 'PTR-SEED-CATALYST',
      type: 'COMPANY',
      displayName: 'Catalyst HR Network',
      companyName: 'Catalyst HR Network SPC',
      contactFirstName: 'Faisal',
      contactLastName: 'Noor',
      email: 'faisal.catalyst@example.test',
      country: 'Qatar',
      defaultCommissionRate: 11,
      currencyCode: currency,
      status: 'AGREEMENT_DRAFTING',
      assignedToUserId: operator.id,
    },
    update: { status: 'AGREEMENT_DRAFTING', assignedToUserId: operator.id },
  });
  const awaitingPartner = await prisma.partner.upsert({
    where: { code: 'PTR-SEED-ORBIT' },
    create: {
      code: 'PTR-SEED-ORBIT',
      type: 'COMPANY',
      displayName: 'Orbit Enterprise Solutions',
      companyName: 'Orbit Enterprise Solutions LLC',
      contactFirstName: 'Reem',
      contactLastName: 'Yousef',
      email: 'reem.orbit@example.test',
      country: 'Saudi Arabia',
      defaultCommissionRate: 10,
      currencyCode: currency,
      status: 'AWAITING_SIGNATURE',
      assignedToUserId: operator.id,
    },
    update: { status: 'AWAITING_SIGNATURE', assignedToUserId: operator.id },
  });
  await prisma.partner.upsert({
    where: { code: 'PTR-SEED-SUMMIT' },
    create: {
      code: 'PTR-SEED-SUMMIT',
      type: 'INDIVIDUAL',
      displayName: 'Summit Referral Consulting',
      contactFirstName: 'Yara',
      contactLastName: 'Mahmoud',
      email: 'yara.summit@example.test',
      country: 'Jordan',
      defaultCommissionRate: 8,
      currencyCode: currency,
      status: 'SUSPENDED',
      assignedToUserId: operator.id,
      notes: 'Suspended pending updated compliance documentation.',
    },
    update: { status: 'SUSPENDED', assignedToUserId: operator.id },
  });

  await prisma.partnerInquiry.upsert({
    where: { referenceNumber: 'PIN-SEED-0001' },
    create: {
      referenceNumber: 'PIN-SEED-0001',
      status: 'NEW',
      type: 'INDIVIDUAL',
      contactFirstName: 'Layla',
      contactLastName: 'Hassan',
      email: 'layla.inquiry@example.test',
      phone: '+971500000011',
      country: 'United Arab Emirates',
      message:
        'Interested in referring mid-market professional services customers.',
      consentAcceptedAt: new Date(),
      source: 'public-website',
      originalSubmission: {
        type: 'INDIVIDUAL',
        contactFirstName: 'Layla',
        contactLastName: 'Hassan',
        email: 'layla.inquiry@example.test',
        phone: '+971500000011',
        country: 'United Arab Emirates',
        message:
          'Interested in referring mid-market professional services customers.',
      },
      assignedToUserId: operator.id,
    },
    update: {},
  });

  let onboarding = await prisma.partnerOnboardingApplication.findFirst({
    where: { partnerId: onboardingPartner.id },
  });
  if (!onboarding) {
    onboarding = await prisma.partnerOnboardingApplication.create({
      data: {
        partnerId: onboardingPartner.id,
        status: 'SUBMITTED',
        invitationTokenHash: hash('seed-brightpath-onboarding'),
        tokenExpiresAt: new Date(Date.now() + 14 * 86400000),
        submittedAt: new Date(),
        version: 1,
        submissions: {
          create: {
            version: 1,
            data: {
              legalName: 'BrightPath Advisory FZ-LLC',
              registrationNumber: 'SEED-BP-2026',
              taxId: 'SEED-VAT-991',
              bankAccountName: 'BrightPath Advisory',
              customerSegments: ['Professional services', 'Technology'],
              termsAccepted: true,
            },
            submittedAt: new Date(),
          },
        },
      },
    });
  }
  const inProgressApplication =
    await prisma.partnerOnboardingApplication.findFirst({
      where: { partnerId: onboardingInProgressPartner.id },
    });
  if (!inProgressApplication)
    await prisma.partnerOnboardingApplication.create({
      data: {
        partnerId: onboardingInProgressPartner.id,
        status: 'IN_PROGRESS',
        invitationTokenHash: hash('seed-horizon-onboarding'),
        tokenExpiresAt: new Date(Date.now() + 14 * 86400000),
        version: 1,
      },
    });

  const signedContent =
    '<h1>Partner Referral Agreement</h1><p>DijiPeople and Northstar Growth Partners agree to a 12.5% referral commission.</p>';
  const signedContract = await prisma.contract.upsert({
    where: { contractNumber: 'PA-SEED-0001' },
    create: {
      contractNumber: 'PA-SEED-0001',
      title: 'Northstar Partner Referral Agreement',
      contractType: 'PARTNER_AGREEMENT',
      status: 'ACTIVE',
      templateId: partnerTemplate.id,
      partnerId: activePartner.id,
      ownerPlatformUserId: operator.id,
      counterpartyName: activePartner.displayName,
      counterpartyEmail: activePartner.email,
      currencyCode: currency,
      effectiveDate: new Date('2026-01-01T00:00:00Z'),
      expiryDate: new Date('2027-01-01T00:00:00Z'),
      currentVersionNumber: 1,
      activatedAt: new Date('2026-01-02T00:00:00Z'),
      createdById: operator.id,
      updatedById: operator.id,
    },
    update: {
      status: 'ACTIVE',
      processStage: 'ACTIVE',
      signedAt: new Date('2026-01-02T00:00:00Z'),
      activatedAt: new Date('2026-01-02T00:00:00Z'),
    },
  });
  const signedVersion = await prisma.contractVersion.upsert({
    where: {
      contractId_version: { contractId: signedContract.id, version: 1 },
    },
    create: {
      contractId: signedContract.id,
      templateVersionId: partnerTemplate.versions[0]?.id,
      version: 1,
      status: 'SIGNED',
      title: signedContract.title,
      contentHtml: signedContent,
      contentText:
        'DijiPeople and Northstar Growth Partners agree to a 12.5% referral commission.',
      contentSha256: hash(signedContent),
      lockedAt: new Date('2026-01-02T00:00:00Z'),
      signedAt: new Date('2026-01-02T00:00:00Z'),
      createdById: operator.id,
    },
    update: {},
  });
  const signedRequest = await prisma.signatureRequest.upsert({
    where: { requestNumber: 'SIG-SEED-0001' },
    create: {
      requestNumber: 'SIG-SEED-0001',
      contractId: signedContract.id,
      contractVersionId: signedVersion.id,
      status: 'COMPLETED',
      subject: 'Sign your Northstar partner agreement',
      sentAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: new Date('2026-01-02T00:00:00Z'),
      createdById: operator.id,
    },
    update: {},
  });
  const recipient = await prisma.signatureRecipient.upsert({
    where: { accessTokenHash: hash('seed-northstar-signature-token') },
    create: {
      signatureRequestId: signedRequest.id,
      name: 'Nadia Rahman',
      email: activePartner.email,
      role: 'Partner authorized signatory',
      status: 'SIGNED',
      accessTokenHash: hash('seed-northstar-signature-token'),
      tokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
      viewedAt: new Date('2026-01-02T00:00:00Z'),
      signedAt: new Date('2026-01-02T00:00:00Z'),
    },
    update: {},
  });
  await prisma.signatureEvidence.upsert({
    where: { recipientId: recipient.id },
    create: {
      recipientId: recipient.id,
      method: 'TYPED',
      typedName: 'Nadia Rahman',
      signatureSha256: hash('Nadia Rahman'),
      consentText: 'I agree to sign this document electronically.',
      consentAcceptedAt: new Date('2026-01-02T00:00:00Z'),
      documentSha256: signedVersion.contentSha256,
      eventHash: hash(`seed-signature-evidence:${recipient.id}`),
      signedAt: new Date('2026-01-02T00:00:00Z'),
    },
    update: {},
  });
  await prisma.signatureEvent.upsert({
    where: {
      signatureRequestId_eventSequence: {
        signatureRequestId: signedRequest.id,
        eventSequence: 1,
      },
    },
    create: {
      signatureRequestId: signedRequest.id,
      recipientId: recipient.id,
      eventType: 'SIGNED',
      eventSequence: 1,
      eventHash: hash(`seed-signature-event:${signedRequest.id}:1`),
      authenticationMethod: 'SECURE_TOKEN',
      verificationStatus: 'TOKEN_VERIFIED',
      metadata: { method: 'TYPED', source: 'seed-platform-workflows' },
      createdAt: new Date('2026-01-02T00:00:00Z'),
    },
    update: {},
  });
  await prisma.partnerPortalUser.upsert({
    where: { email: activePartner.email },
    create: {
      partnerId: activePartner.id,
      email: activePartner.email,
      firstName: 'Nadia',
      lastName: 'Rahman',
      passwordHash: await bcrypt.hash('PartnerDemo!2026', 12),
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
    update: { partnerId: activePartner.id },
  });

  let lead = await prisma.lead.findFirst({
    where: {
      partnerId: activePartner.id,
      workEmail: 'procurement@acme-seed.example.test',
    },
  });
  if (!lead)
    lead = await prisma.lead.create({
      data: {
        contactFirstName: 'Aisha',
        contactLastName: 'Khan',
        fullName: 'Aisha Khan',
        companyName: 'Acme Professional Services',
        workEmail: 'procurement@acme-seed.example.test',
        industry: 'Professional Services',
        companySize: '201-500',
        source: 'PARTNER_PORTAL',
        status: 'NEW',
        partnerId: activePartner.id,
      },
    });
  await prisma.partnerLeadReview.upsert({
    where: { leadId: lead.id },
    create: {
      leadId: lead.id,
      partnerId: activePartner.id,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      lockedAt: new Date(),
    },
    update: {},
  });
  let approvedLead = await prisma.lead.findFirst({
    where: {
      partnerId: activePartner.id,
      workEmail: 'people@atlas-seed.example.test',
    },
  });
  if (!approvedLead)
    approvedLead = await prisma.lead.create({
      data: {
        contactFirstName: 'Khalid',
        contactLastName: 'Farouk',
        fullName: 'Khalid Farouk',
        companyName: 'Atlas Logistics Group',
        workEmail: 'people@atlas-seed.example.test',
        industry: 'Logistics',
        companySize: '501-1000',
        country: 'Saudi Arabia',
        source: 'PARTNER_PORTAL',
        status: 'QUALIFIED',
        isQualified: true,
        assignedToUserId: operator.id,
        partnerId: activePartner.id,
      },
    });
  await prisma.partnerLeadReview.upsert({
    where: { leadId: approvedLead.id },
    create: {
      leadId: approvedLead.id,
      partnerId: activePartner.id,
      status: 'APPROVED',
      submittedAt: new Date(Date.now() - 7 * 86400000),
      lockedAt: new Date(Date.now() - 7 * 86400000),
      reviewedAt: new Date(Date.now() - 6 * 86400000),
      reviewedById: operator.id,
      approvedAt: new Date(Date.now() - 6 * 86400000),
      reviewerNotes:
        'Qualified enterprise referral accepted for presales follow-up.',
    },
    update: {
      status: 'APPROVED',
      approvedAt: new Date(Date.now() - 6 * 86400000),
    },
  });
  await prisma.partnerCommission.upsert({
    where: { commissionNumber: 'COM-SEED-0001' },
    create: {
      partnerId: activePartner.id,
      leadId: lead.id,
      commissionNumber: 'COM-SEED-0001',
      status: 'APPROVED',
      baseAmount: 24000,
      commissionRate: 12.5,
      commissionAmount: 3000,
      currencyCode: currency,
      description: 'Approved first-year referral commission.',
      earnedAt: new Date(),
      dueAt: new Date(Date.now() + 30 * 86400000),
    },
    update: {},
  });

  let customer = await prisma.customerAccount.findFirst({
    where: {
      seedSource: 'seed-platform-workflows',
      companyName: 'Crescent Retail Group',
    },
  });
  if (!customer)
    customer = await prisma.customerAccount.create({
      data: {
        companyName: 'Crescent Retail Group',
        legalCompanyName: 'Crescent Retail Group LLC',
        primaryContactFirstName: 'Sara',
        primaryContactLastName: 'Mansour',
        primaryContactEmail: 'sara.customer@example.test',
        contactEmail: 'sara.customer@example.test',
        country: 'Saudi Arabia',
        industry: 'Retail',
        companySize: '501-1000',
        status: 'ONBOARDING',
        assignedToUserId: operator.id,
        isDemoData: true,
        seedSource: 'seed-platform-workflows',
      },
    });
  let customerOnboarding = await prisma.customerOnboarding.findFirst({
    where: { customerId: customer.id },
  });
  if (!customerOnboarding)
    customerOnboarding = await prisma.customerOnboarding.create({
      data: {
        customerId: customer.id,
        plannedTenantSlug: 'crescent-retail-seed',
        billingCycle: 'ANNUAL',
        agreedPrice: 36000,
        primaryOwnerFirstName: 'Sara',
        primaryOwnerLastName: 'Mansour',
        primaryOwnerWorkEmail: 'sara.customer@example.test',
        paymentConfirmed: true,
        implementationKickoffDone: true,
        status: 'IN_PROGRESS',
        subStatus: 'Customer agreement awaiting signature',
      },
    });
  const customerContent =
    '<h1>Customer Service Agreement</h1><p>DijiPeople will provide platform services to Crescent Retail Group.</p>';
  const customerContract = await prisma.contract.upsert({
    where: { contractNumber: 'CA-SEED-0001' },
    create: {
      contractNumber: 'CA-SEED-0001',
      title: 'Crescent Retail Customer Service Agreement',
      contractType: 'CUSTOMER_AGREEMENT',
      status: 'READY_FOR_SIGNATURE',
      templateId: customerTemplate.id,
      customerAccountId: customer.id,
      customerOnboardingId: customerOnboarding.id,
      ownerPlatformUserId: operator.id,
      counterpartyName: customer.companyName,
      counterpartyEmail: customer.contactEmail,
      currencyCode: currency,
      contractValue: 36000,
      currentVersionNumber: 1,
      createdById: operator.id,
      updatedById: operator.id,
    },
    update: {
      status: 'SIGNATURE_IN_PROGRESS',
      processStage: 'AWAITING_CUSTOMER_SIGNATURE',
    },
  });
  const customerVersion = await prisma.contractVersion.upsert({
    where: {
      contractId_version: { contractId: customerContract.id, version: 1 },
    },
    create: {
      contractId: customerContract.id,
      templateVersionId: customerTemplate.versions[0]?.id,
      version: 1,
      status: 'APPROVED',
      title: customerContract.title,
      contentHtml: customerContent,
      contentText:
        'DijiPeople will provide platform services to Crescent Retail Group.',
      contentSha256: hash(customerContent),
      createdById: operator.id,
    },
    update: { status: 'SENT_FOR_SIGNATURE' },
  });
  const customerSignatureRequest = await prisma.signatureRequest.upsert({
    where: { requestNumber: 'SIG-SEED-CUSTOMER-0001' },
    create: {
      requestNumber: 'SIG-SEED-CUSTOMER-0001',
      contractId: customerContract.id,
      contractVersionId: customerVersion.id,
      status: 'SENT',
      subject: 'Crescent Retail customer agreement',
      message: 'Please review and sign the customer service agreement.',
      expiresAt: new Date(Date.now() + 10 * 86400000),
      sentAt: new Date(Date.now() - 86400000),
      createdById: operator.id,
    },
    update: { status: 'SENT' },
  });
  const customerRecipient = await prisma.signatureRecipient.upsert({
    where: { accessTokenHash: hash('seed-crescent-customer-signature') },
    create: {
      signatureRequestId: customerSignatureRequest.id,
      name: 'Sara Mansour',
      email: customer.contactEmail,
      role: 'Customer authorized signatory',
      status: 'SENT',
      accessTokenHash: hash('seed-crescent-customer-signature'),
      tokenExpiresAt: new Date(Date.now() + 10 * 86400000),
    },
    update: { status: 'SENT' },
  });
  await prisma.signatureEvent.upsert({
    where: {
      signatureRequestId_eventSequence: {
        signatureRequestId: customerSignatureRequest.id,
        eventSequence: 1,
      },
    },
    create: {
      signatureRequestId: customerSignatureRequest.id,
      recipientId: customerRecipient.id,
      eventType: 'SENT',
      eventSequence: 1,
      eventHash: hash(`seed-signature-event:${customerSignatureRequest.id}:1`),
      authenticationMethod: 'SECURE_TOKEN',
      verificationStatus: 'TOKEN_ISSUED',
    },
    update: {},
  });

  const activeCustomerContract = await prisma.contract.upsert({
    where: { contractNumber: 'CA-SEED-ACTIVE-0002' },
    create: {
      contractNumber: 'CA-SEED-ACTIVE-0002',
      title: 'Crescent Retail Implementation Addendum',
      contractType: 'ADDENDUM',
      status: 'ACTIVE',
      processStage: 'ACTIVE',
      templateId: customerTemplate.id,
      customerAccountId: customer.id,
      customerOnboardingId: customerOnboarding.id,
      ownerPlatformUserId: operator.id,
      counterpartyName: customer.companyName,
      counterpartyEmail: customer.contactEmail,
      currencyCode: currency,
      contractValue: 12000,
      effectiveDate: new Date(Date.now() - 60 * 86400000),
      expiryDate: new Date(Date.now() + 305 * 86400000),
      signedAt: new Date(Date.now() - 61 * 86400000),
      activatedAt: new Date(Date.now() - 60 * 86400000),
      currentVersionNumber: 1,
      createdById: operator.id,
      updatedById: operator.id,
    },
    update: { status: 'ACTIVE', processStage: 'ACTIVE' },
  });
  const activeContent =
    '<h1>Implementation Addendum</h1><p>Implementation services and delivery milestones.</p>';
  await prisma.contractVersion.upsert({
    where: {
      contractId_version: { contractId: activeCustomerContract.id, version: 1 },
    },
    create: {
      contractId: activeCustomerContract.id,
      version: 1,
      status: 'SIGNED',
      title: activeCustomerContract.title,
      contentHtml: activeContent,
      contentText: 'Implementation services and delivery milestones.',
      contentSha256: hash(activeContent),
      lockedAt: new Date(Date.now() - 61 * 86400000),
      signedAt: new Date(Date.now() - 61 * 86400000),
      createdById: operator.id,
    },
    update: {},
  });

  const expiringContract = await prisma.contract.upsert({
    where: { contractNumber: 'CA-SEED-EXPIRING-0003' },
    create: {
      contractNumber: 'CA-SEED-EXPIRING-0003',
      title: 'Crescent Retail Legacy Support Agreement',
      contractType: 'SERVICE_AGREEMENT',
      status: 'EXPIRING',
      processStage: 'RENEWAL_REVIEW',
      customerAccountId: customer.id,
      ownerPlatformUserId: operator.id,
      counterpartyName: customer.companyName,
      counterpartyEmail: customer.contactEmail,
      currencyCode: currency,
      contractValue: 18000,
      effectiveDate: new Date(Date.now() - 335 * 86400000),
      expiryDate: new Date(Date.now() + 30 * 86400000),
      renewalNoticeDays: 45,
      currentVersionNumber: 1,
      createdById: operator.id,
      updatedById: operator.id,
    },
    update: { status: 'EXPIRING', processStage: 'RENEWAL_REVIEW' },
  });
  const expiringContent =
    '<h1>Legacy Support Agreement</h1><p>Annual premium support services.</p>';
  await prisma.contractVersion.upsert({
    where: {
      contractId_version: { contractId: expiringContract.id, version: 1 },
    },
    create: {
      contractId: expiringContract.id,
      version: 1,
      status: 'SIGNED',
      title: expiringContract.title,
      contentHtml: expiringContent,
      contentText: 'Annual premium support services.',
      contentSha256: hash(expiringContent),
      lockedAt: new Date(Date.now() - 335 * 86400000),
      signedAt: new Date(Date.now() - 335 * 86400000),
      createdById: operator.id,
    },
    update: {},
  });

  const draftingAgreement = await prisma.contract.upsert({
    where: { contractNumber: 'PA-SEED-DRAFT-0002' },
    create: {
      contractNumber: 'PA-SEED-DRAFT-0002',
      title: 'Catalyst Partner Referral Agreement',
      contractType: 'PARTNER_AGREEMENT',
      status: 'INTERNAL_REVIEW',
      processStage: 'AGREEMENT_DRAFTING',
      documentSource: 'TEMPLATE',
      templateId: partnerTemplate.id,
      partnerId: draftingPartner.id,
      ownerPlatformUserId: operator.id,
      internalLegalOwnerId: operator.id,
      counterpartyName: draftingPartner.displayName,
      counterpartyEmail: draftingPartner.email,
      currencyCode: currency,
      commissionPercentage: 11,
      commissionBasis: 'First-year net subscription revenue',
      currentVersionNumber: 1,
      createdById: operator.id,
      updatedById: operator.id,
    },
    update: { status: 'INTERNAL_REVIEW', processStage: 'AGREEMENT_DRAFTING' },
  });
  const draftContent =
    '<h1>Partner Referral Agreement</h1><p>Catalyst referral terms are under internal review.</p>';
  await prisma.contractVersion.upsert({
    where: {
      contractId_version: { contractId: draftingAgreement.id, version: 1 },
    },
    create: {
      contractId: draftingAgreement.id,
      templateVersionId: partnerTemplate.versions[0]?.id,
      version: 1,
      status: 'REVIEW',
      title: draftingAgreement.title,
      contentHtml: draftContent,
      contentText: 'Catalyst referral terms are under internal review.',
      contentSha256: hash(draftContent),
      createdById: operator.id,
    },
    update: {},
  });
  await prisma.platformApprovalRequest.upsert({
    where: { requestNumber: 'APR-SEED-CONTRACT-0001' },
    create: {
      requestNumber: 'APR-SEED-CONTRACT-0001',
      moduleKey: 'contracts',
      entityType: 'Contract',
      entityId: draftingAgreement.id,
      contractId: draftingAgreement.id,
      title: 'Approve Catalyst Partner Referral Agreement',
      status: 'PENDING',
      currentStepOrder: 1,
      submittedById: operator.id,
      submittedAt: new Date(Date.now() - 2 * 86400000),
      steps: {
        create: [
          {
            stepOrder: 1,
            name: 'Commercial approval',
            approverType: 'PLATFORM_USER',
            approverId: operator.id,
            status: 'PENDING',
            startedAt: new Date(Date.now() - 2 * 86400000),
            dueAt: new Date(Date.now() + 86400000),
          },
          {
            stepOrder: 2,
            name: 'Legal approval',
            approverType: 'PLATFORM_USER',
            approverId: operator.id,
            status: 'NOT_STARTED',
          },
        ],
      },
    },
    update: { status: 'PENDING', currentStepOrder: 1 },
  });

  const awaitingPartnerAgreement = await prisma.contract.upsert({
    where: { contractNumber: 'PA-SEED-SIGN-0003' },
    create: {
      contractNumber: 'PA-SEED-SIGN-0003',
      title: 'Orbit Partner Referral Agreement',
      contractType: 'PARTNER_AGREEMENT',
      status: 'SIGNATURE_IN_PROGRESS',
      processStage: 'AWAITING_SIGNATURE',
      documentSource: 'TEMPLATE',
      templateId: partnerTemplate.id,
      partnerId: awaitingPartner.id,
      ownerPlatformUserId: operator.id,
      counterpartyName: awaitingPartner.displayName,
      counterpartyEmail: awaitingPartner.email,
      currencyCode: currency,
      commissionPercentage: 10,
      currentVersionNumber: 1,
      createdById: operator.id,
      updatedById: operator.id,
    },
    update: {
      status: 'SIGNATURE_IN_PROGRESS',
      processStage: 'AWAITING_SIGNATURE',
    },
  });
  const awaitingPartnerContent =
    '<h1>Partner Referral Agreement</h1><p>Orbit referral agreement awaiting signature.</p>';
  const awaitingPartnerVersion = await prisma.contractVersion.upsert({
    where: {
      contractId_version: {
        contractId: awaitingPartnerAgreement.id,
        version: 1,
      },
    },
    create: {
      contractId: awaitingPartnerAgreement.id,
      templateVersionId: partnerTemplate.versions[0]?.id,
      version: 1,
      status: 'SENT_FOR_SIGNATURE',
      title: awaitingPartnerAgreement.title,
      contentHtml: awaitingPartnerContent,
      contentText: 'Orbit referral agreement awaiting signature.',
      contentSha256: hash(awaitingPartnerContent),
      createdById: operator.id,
    },
    update: { status: 'SENT_FOR_SIGNATURE' },
  });
  const awaitingPartnerRequest = await prisma.signatureRequest.upsert({
    where: { requestNumber: 'SIG-SEED-PARTNER-0002' },
    create: {
      requestNumber: 'SIG-SEED-PARTNER-0002',
      contractId: awaitingPartnerAgreement.id,
      contractVersionId: awaitingPartnerVersion.id,
      status: 'SENT',
      subject: 'Orbit partner agreement signature',
      expiresAt: new Date(Date.now() + 12 * 86400000),
      sentAt: new Date(Date.now() - 2 * 86400000),
      createdById: operator.id,
    },
    update: { status: 'SENT' },
  });
  await prisma.signatureRecipient.upsert({
    where: { accessTokenHash: hash('seed-orbit-partner-signature') },
    create: {
      signatureRequestId: awaitingPartnerRequest.id,
      name: 'Reem Yousef',
      email: awaitingPartner.email,
      role: 'Partner authorized signatory',
      status: 'SENT',
      accessTokenHash: hash('seed-orbit-partner-signature'),
      tokenExpiresAt: new Date(Date.now() + 12 * 86400000),
    },
    update: { status: 'SENT' },
  });

  const supportCase = await prisma.supportCase.upsert({
    where: { caseNumber: 'CASE-SEED-0001' },
    create: {
      caseNumber: 'CASE-SEED-0001',
      title: 'Intermittent payroll report export failure',
      description:
        'Customer reports a sanitized export failure during month-end processing.',
      status: 'INVESTIGATING',
      priority: 'HIGH',
      severity: 'S2_HIGH',
      channel: 'MONITORING',
      category: 'Application error',
      productArea: 'Payroll reporting',
      customerAccountId: customer.id,
      requesterName: 'Sara Mansour',
      requesterEmail: customer.contactEmail,
      assignedToUserId: operator.id,
      assignedTeam: 'Customer Support',
      firstRespondedAt: new Date(),
      resolutionDueAt: new Date(Date.now() + 12 * 3600000),
      customerUpdate:
        'Engineering is reviewing the sanitized trace; no payroll data was lost.',
      createdById: operator.id,
    },
    update: {},
  });
  await prisma.supportCase.upsert({
    where: { caseNumber: 'CASE-SEED-NEW-0002' },
    create: {
      caseNumber: 'CASE-SEED-NEW-0002',
      title: 'New user cannot access onboarding checklist',
      description:
        'Customer submitted a new access question through the support form.',
      status: 'NEW',
      priority: 'NORMAL',
      severity: 'S3_MEDIUM',
      channel: 'WEB',
      category: 'Access',
      productArea: 'Customer onboarding',
      customerAccountId: customer.id,
      requesterName: 'Sara Mansour',
      requesterEmail: customer.contactEmail,
      assignedTeam: 'Customer Support',
      firstResponseDueAt: new Date(Date.now() + 4 * 3600000),
      resolutionDueAt: new Date(Date.now() + 24 * 3600000),
      createdById: operator.id,
    },
    update: { status: 'NEW' },
  });
  await prisma.supportCase.upsert({
    where: { caseNumber: 'CASE-SEED-SLA-0003' },
    create: {
      caseNumber: 'CASE-SEED-SLA-0003',
      title: 'Critical billing reconciliation blocked',
      description:
        'Month-end reconciliation is blocked and the resolution SLA is at risk.',
      status: 'ASSIGNED',
      priority: 'URGENT',
      severity: 'S1_CRITICAL',
      channel: 'EMAIL',
      category: 'Billing',
      productArea: 'Invoice reconciliation',
      customerAccountId: customer.id,
      requesterName: 'Sara Mansour',
      requesterEmail: customer.contactEmail,
      assignedToUserId: operator.id,
      assignedTeam: 'Billing Support',
      escalationLevel: 2,
      firstResponseDueAt: new Date(Date.now() - 2 * 3600000),
      resolutionDueAt: new Date(Date.now() - 30 * 60000),
      createdById: operator.id,
    },
    update: {
      status: 'ASSIGNED',
      firstResponseDueAt: new Date(Date.now() - 2 * 3600000),
      resolutionDueAt: new Date(Date.now() - 30 * 60000),
    },
  });
  const seededError = await prisma.errorLog.upsert({
    where: { traceId: 'trace-seed-payroll-export-0001' },
    create: {
      traceId: 'trace-seed-payroll-export-0001',
      errorCode: 'REPORT_EXPORT_TIMEOUT',
      statusCode: 504,
      severity: 'HIGH',
      sourceApp: 'web',
      environment: 'production',
      message: 'Payroll report export exceeded the processing timeout.',
      description:
        'Sanitized timeout captured while generating a month-end payroll export.',
      method: 'POST',
      path: '/api/reports/payroll/export',
      supportStatus: 'INVESTIGATING',
      assignedTo: 'Customer Support',
      assignedToUserId: operator.id,
      customerUpdate:
        'Engineering is reviewing the sanitized trace; no payroll data was lost.',
    },
    update: { supportStatus: 'INVESTIGATING', assignedToUserId: operator.id },
  });
  await prisma.supportCaseIncident.upsert({
    where: {
      supportCaseId_errorLogId: {
        supportCaseId: supportCase.id,
        errorLogId: seededError.id,
      },
    },
    create: {
      supportCaseId: supportCase.id,
      errorLogId: seededError.id,
      linkedById: operator.id,
    },
    update: {},
  });
  const timelineCount = await prisma.supportCaseTimeline.count({
    where: { supportCaseId: supportCase.id },
  });
  if (!timelineCount)
    await prisma.supportCaseTimeline.createMany({
      data: [
        {
          supportCaseId: supportCase.id,
          eventType: 'CASE_CREATED',
          actorType: 'PLATFORM_USER',
          actorId: operator.id,
          message: 'Support case created from a sanitized monitoring incident.',
        },
        {
          supportCaseId: supportCase.id,
          eventType: 'CUSTOMER_UPDATE_SENT',
          actorType: 'PLATFORM_USER',
          actorId: operator.id,
          message: 'Customer-safe investigation update recorded.',
        },
      ],
    });

  console.log('Platform workflow seed completed:', {
    partners: 6,
    partnerInquiry: 'PIN-SEED-0001',
    partnerAgreement: signedContract.contractNumber,
    partnerLead: lead.id,
    customer: customer.companyName,
    customerAgreement: customerContract.contractNumber,
    supportCase: supportCase.caseNumber,
    seededLifecycleStates: {
      partnerOnboarding: ['IN_PROGRESS', 'SUBMITTED'],
      partnerAgreements: ['AGREEMENT_DRAFTING', 'AWAITING_SIGNATURE', 'ACTIVE'],
      partnerLeads: ['SUBMITTED', 'APPROVED'],
      customerContracts: ['SIGNATURE_IN_PROGRESS', 'ACTIVE', 'EXPIRING'],
      supportCases: ['NEW', 'ASSIGNED_SLA_RISK', 'INVESTIGATING_WITH_INCIDENT'],
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
