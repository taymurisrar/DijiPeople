import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ContractStatus,
  ContractType,
  LegalDocumentType,
  PartnerInquiryStatus,
  PartnerLeadReviewStatus,
  PartnerOnboardingStatus,
  PartnerStatus,
  PartnerType,
  Prisma,
} from '@prisma/client';
import {
  canApplyPartnerAction,
  PARTNER_LIFECYCLE_ACTIONS,
  PARTNER_ONBOARDED_STATUSES,
} from '@repo/config';
import * as bcrypt from 'bcryptjs';
import { isEmail } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { AUDIT_ACTIONS } from '../../common/constants/audit-actions';
import { AppError } from '../../common/errors/app-error';
import { buildPublicSiteUrl } from '../../common/config/public-site-url.config';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import {
  emailPage,
  PlatformCommunicationsService,
} from '../platform-communications/platform-communications.service';
import type { PartnerActor } from './partner-auth.guard';
import { partnerOnboardingReviewRefusal } from './partner-onboarding.state-machine';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { AuditService } from '../audit/audit.service';
import { PlatformNumberingService } from '../../common/numbering/platform-numbering.service';
import { assertCurrencyEnabled } from '../../common/reference-data/platform-enabled-currencies';
import {
  assertNoPartnerDuplicate,
  findOnboardingIdentifierDuplicate,
  findPartnerDuplicate,
} from '../partners/partner-duplicate-detection';
import {
  assertPartnerNotLive,
  partnerStatusLabel,
  partnerTransition,
} from '../partners/partner-lifecycle';
import {
  missingAdminIdentityFields,
  missingOnboardingFields,
} from '../partners/partner-type-policy';
import {
  CreatePartnerInquiryDto,
  CreatePartnerPortalReferralLinkDto,
  PartnerLeadDto,
  PartnerLoginDto,
  PartnerRefreshDto,
  ReviewPartnerInquiryDto,
  ReviewPartnerLeadDto,
  ReviewPartnerOnboardingDto,
  SubmitPartnerOnboardingDto,
} from './dto/partner-experience.dto';
import { CURRENT_PRIVACY_NOTICE_VERSION } from '../leads/acquisition.catalog';
import { LegalService } from '../legal/legal.service';

@Injectable()
export class PartnerExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly communications: PlatformCommunicationsService,
    private readonly events: PlatformEventsService,
    private readonly legalService: LegalService,
    private readonly auditService: AuditService,
    private readonly numbering: PlatformNumberingService,
  ) {}

  async submitInquiry(dto: CreatePartnerInquiryDto, correlationId?: string) {
    if (!dto.consentAccepted)
      throw new BadRequestException('Privacy consent is required.');
    /*
     * BUG-3549. A COMPANY inquiry with no company name used to be accepted —
     * `companyName` is optional on the DTO because an INDIVIDUAL inquiry
     * genuinely has none. `contactFirstName`/`contactLastName` are already
     * required for every applicant at the DTO level, so only the
     * company-only field needs a type-conditional check here.
     */
    const missingIdentity = missingAdminIdentityFields(dto.type, {
      companyName: dto.companyName,
      contactFirstName: dto.contactFirstName,
      contactLastName: dto.contactLastName,
    });
    if (missingIdentity.length)
      throw new BadRequestException(
        `${dto.type === 'COMPANY' ? 'A company' : 'An individual'} application requires: ${missingIdentity.join(', ')}.`,
      );
    const normalized = partnerApplicationSnapshot(dto);
    const submissionHash = sha256(JSON.stringify(normalized));
    const retry = await this.prisma.partnerInquiry.findUnique({
      where: { submissionHash },
    });
    if (retry) {
      await this.prisma.partnerInquiry.update({
        where: { id: retry.id },
        data: { lastRetryAt: new Date() },
      });
      return {
        referenceNumber: retry.referenceNumber,
        message: 'Your partner inquiry has already been received.',
      };
    }
    const duplicate = await this.prisma.partner.findFirst({
      where: {
        OR: [
          { email: normalized.email },
          ...(normalized.companyName
            ? [
                {
                  companyName: {
                    equals: normalized.companyName,
                    mode: 'insensitive' as const,
                  },
                },
              ]
            : []),
        ],
      },
      select: { id: true, status: true },
    });
    if (duplicate && !['INQUIRY', 'NEW_INQUIRY'].includes(duplicate.status))
      throw new BadRequestException(
        'A partner application already exists for this email or company. Contact the partner team if you need help.',
      );
    const submittedAt = new Date();
    // The notice in force, from the published legal documents. The constant
    // is only a pre-launch fallback now, not the source of truth.
    const publishedNotice = await this.legalService.resolvePublished(
      LegalDocumentType.PRIVACY_POLICY,
      null,
    );
    const privacyNoticeVersion = publishedNotice
      ? `v${publishedNotice.version}`
      : CURRENT_PRIVACY_NOTICE_VERSION;

    const inquiry = await this.prisma.$transaction(async (tx) => {
      const partner = duplicate
        ? await tx.partner.update({
            where: { id: duplicate.id },
            data: {
              type: dto.type,
              displayName:
                normalized.companyName ||
                `${normalized.contactFirstName} ${normalized.contactLastName}`,
              companyName: normalized.companyName,
              contactFirstName: normalized.contactFirstName,
              contactLastName: normalized.contactLastName,
              email: normalized.email,
              phone: normalized.phone,
              country: normalized.country,
              website: normalized.website,
              status: PartnerStatus.INQUIRY,
              applicationSnapshot: normalized as Prisma.InputJsonValue,
              applicationSubmittedAt: submittedAt,
              applicationSource: normalized.source,
            },
          })
        : await tx.partner.create({
            data: {
              code: partnerReference(),
              // ADR-0027 — numbered on this transaction; never from input.
              partnerNumber: await this.numbering.next('partner', tx),
              type: dto.type,
              // ITEM-0030 — the proposed relationship survives conversion.
              partnershipModel: dto.partnershipModel ?? null,
              displayName:
                normalized.companyName ||
                `${normalized.contactFirstName} ${normalized.contactLastName}`,
              companyName: normalized.companyName,
              contactFirstName: normalized.contactFirstName,
              contactLastName: normalized.contactLastName,
              email: normalized.email,
              phone: normalized.phone,
              country: normalized.country,
              website: normalized.website,
              defaultCommissionRate: 0,
              currencyCode: 'USD',
              status: PartnerStatus.INQUIRY,
              applicationSnapshot: normalized as Prisma.InputJsonValue,
              applicationSubmittedAt: submittedAt,
              applicationSource: normalized.source,
            },
          });
      const created = await tx.partnerInquiry.create({
        data: {
          referenceNumber: reference('PIN'),
          partnerId: partner.id,
          status: PartnerInquiryStatus.NEW,
          type: dto.type,
          companyName: normalized.companyName,
          contactFirstName: normalized.contactFirstName,
          contactLastName: normalized.contactLastName,
          email: normalized.email,
          phone: normalized.phone,
          country: normalized.country,
          website: normalized.website,
          message: normalized.message,
          // The commercial relationship, distinct from the entity type above.
          partnershipModel: dto.partnershipModel ?? null,
          // Privacy notice acknowledgement, plus the version the server had.
          // A client-supplied version could claim any notice at all.
          consentAcceptedAt: submittedAt,
          privacyNoticeVersion,
          // Optional and separate: a partnership inquiry is submittable
          // without agreeing to marketing.
          marketingConsent: dto.marketingConsent === true,
          marketingConsentAt:
            dto.marketingConsent === true ? submittedAt : null,
          // Attribution, captured not typed. Absent stays absent.
          sourcePage: dto.sourcePage ?? null,
          referrerUrl: dto.referrerUrl ?? null,
          utmSource: dto.utmSource ?? null,
          utmMedium: dto.utmMedium ?? null,
          utmCampaign: dto.utmCampaign ?? null,
          correlationId: correlationId ?? null,
          source: normalized.source,
          submissionHash,
          originalSubmission: normalized as Prisma.InputJsonValue,
          submittedAt,
        },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId: partner.id,
          eventType: 'PARTNER_APPLICATION_SUBMITTED',
          actorType: 'PUBLIC_APPLICANT',
          message: `Partner application submitted by ${normalized.contactFirstName} ${normalized.contactLastName}.`,
          metadata: {
            inquiryId: created.id,
            referenceNumber: created.referenceNumber,
          },
        },
      });
      // Same transaction as the inquiry: an inquiry without the
      // acknowledgement that justified contacting them is unprovable consent.
      if (publishedNotice) {
        await this.legalService.acknowledge(
          {
            legalDocumentVersionId: publishedNotice.versionId,
            source: 'landing:partners',
            subjectEmail: created.email,
          },
          tx,
        );
      }

      return created;
    });
    await this.communications.sendEmail({
      eventCode: 'PARTNER_INQUIRY_RECEIVED',
      recipient: inquiry.email,
      subject: `We received your partner inquiry ${inquiry.referenceNumber}`,
      html: emailPage(
        'Partner inquiry received',
        `Thank you, ${inquiry.contactFirstName}. Our partner team will review your inquiry and contact you with the next step. Reference: ${inquiry.referenceNumber}.`,
      ),
      entityType: 'PartnerInquiry',
      entityId: inquiry.id,
    });
    await this.notifyPartnerTeam(
      'NEW_PARTNER_APPLICATION',
      `New partner application ${inquiry.referenceNumber}`,
      `${normalized.contactFirstName} ${normalized.contactLastName} submitted a ${dto.type.toLowerCase()} partner application.`,
      inquiry.partnerId!,
    );
    await this.events.record({
      eventCode: 'PARTNER_INQUIRY_SUBMITTED',
      source: 'LANDING',
      correlationId,
      entityType: 'PartnerInquiry',
      entityId: inquiry.id,
      route: '/public/partners/inquiries',
      actorType: 'PUBLIC_VISITOR',
      metadata: {
        referenceNumber: inquiry.referenceNumber,
        partnerId: inquiry.partnerId,
        partnerType: inquiry.type,
        source: inquiry.source,
      },
    });
    return {
      referenceNumber: inquiry.referenceNumber,
      message: 'Thank you. Our partner team will review your inquiry.',
    };
  }

  async listInquiries(user: AuthenticatedUser, status?: PartnerInquiryStatus) {
    this.assertPlatform(user);
    return {
      items: await this.prisma.partnerInquiry.findMany({
        where: status ? { status } : {},
        include: { partner: true },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  async qualifyInquiry(
    user: AuthenticatedUser,
    inquiryId: string,
    dto: ReviewPartnerInquiryDto,
  ) {
    this.assertWrite(user);
    const inquiry = await this.prisma.partnerInquiry.findUnique({
      where: { id: inquiryId },
    });
    if (!inquiry) throw new NotFoundException('Partner inquiry was not found.');
    if (inquiry.status === PartnerInquiryStatus.REJECTED)
      throw new BadRequestException('Rejected inquiry cannot be qualified.');
    /*
     * ADR-0026 D1. Re-qualifying an inquiry linked to a live partner reset it
     * to APPROVED_AWAITING_AGREEMENT — a working partner pushed back to the
     * start of contracting by a stale application.
     */
    await this.assertLinkedPartnerNotLive(
      inquiry.partnerId,
      'Approving the application',
    );
    const [partnerSettings, platformDefaults] = await Promise.all([
      this.setting('partner-settings'),
      this.setting('platform-defaults'),
    ]);
    const defaultCommission = boundedNumber(
      partnerSettings.defaultCommissionRate,
      0,
      0,
      100,
    );
    const reportingCurrency =
      typeof platformDefaults.reportingCurrency === 'string'
        ? platformDefaults.reportingCurrency
        : typeof platformDefaults.currency === 'string'
          ? platformDefaults.currency
          : 'USD';
    /*
     * Scenario E (TASK-0032 owner brief). `inquiry.partnerId` is how this
     * schema already answers "does an existing partner belong to this
     * inquiry" — `submitInquiry` sets it on every inquiry it creates. The only
     * way this branch reaches `tx.partner.create` below is an inquiry that
     * predates that link (imported data, or one created outside
     * `submitInquiry`), and creating a second `Partner` for an email/company
     * that already has one would be exactly the duplicate BUG-3550 is about —
     * so the same duplicate check that guards the admin create path guards
     * this one too, before the transaction opens.
     */
    if (!inquiry.partnerId) {
      const missingIdentity = missingAdminIdentityFields(inquiry.type, {
        companyName: inquiry.companyName,
        contactFirstName: inquiry.contactFirstName,
        contactLastName: inquiry.contactLastName,
      });
      if (missingIdentity.length)
        throw new BadRequestException(
          `${inquiry.type === 'COMPANY' ? 'A company' : 'An individual'} partner requires: ${missingIdentity.join(', ')}.`,
        );
      assertNoPartnerDuplicate(
        await findPartnerDuplicate(this.prisma, {
          email: inquiry.email,
          companyName: inquiry.companyName,
          type: inquiry.type,
        }),
      );
      // ADR-0026 D4 — the currency is only chosen on this (create) branch.
      if (dto.currencyCode)
        await assertCurrencyEnabled(this.prisma, dto.currencyCode);
    }
    const partner = await this.prisma.$transaction(async (tx) => {
      const created = inquiry.partnerId
        ? await tx.partner.update({
            where: { id: inquiry.partnerId },
            data: {
              status: PartnerStatus.APPROVED_AWAITING_AGREEMENT,
              assignedToUserId: dto.assignedToUserId,
              notes: dto.notes,
            },
          })
        : await tx.partner.create({
            data: {
              code: partnerReference(),
              // ADR-0027 — numbered on this transaction; never from input.
              partnerNumber: await this.numbering.next('partner', tx),
              type: inquiry.type,
              // ITEM-0030 — carried from the inquiry rather than dropped.
              partnershipModel: inquiry.partnershipModel ?? null,
              displayName:
                inquiry.companyName ||
                `${inquiry.contactFirstName} ${inquiry.contactLastName}`,
              companyName: inquiry.companyName,
              contactFirstName: inquiry.contactFirstName,
              contactLastName: inquiry.contactLastName,
              email: inquiry.email,
              phone: inquiry.phone,
              country: inquiry.country,
              website: inquiry.website,
              defaultCommissionRate:
                dto.defaultCommissionRate ?? defaultCommission,
              currencyCode:
                dto.currencyCode?.toUpperCase() ?? reportingCurrency,
              status: PartnerStatus.APPROVED_AWAITING_AGREEMENT,
              assignedToUserId: dto.assignedToUserId,
              notes: dto.notes,
            },
          });
      await tx.partnerInquiry.update({
        where: { id: inquiryId },
        data: {
          status: PartnerInquiryStatus.CONVERTED,
          partnerId: created.id,
          qualificationNotes: dto.notes,
          assignedToUserId: dto.assignedToUserId,
        },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId: created.id,
          eventType: 'PARTNER_APPLICATION_APPROVED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Partner application approved by ${user.email}. Agreement execution is required before onboarding.`,
          metadata: { inquiryId },
        },
      });
      return created;
    });
    await this.communications.sendEmail({
      eventCode: 'PARTNER_APPLICATION_APPROVED',
      recipient: partner.email,
      subject: 'Your DijiPeople partner application was approved',
      html: emailPage(
        'Partner application approved',
        'Your application was approved. The partner team will prepare the required agreement before onboarding begins.',
      ),
      entityType: 'Partner',
      entityId: partner.id,
      requestedById: user.userId,
    });
    await this.events.record({
      eventCode: 'PARTNER_APPROVED',
      source: 'ADMIN',
      entityType: 'Partner',
      entityId: partner.id,
      actorType: 'PLATFORM_USER',
      actorId: user.userId,
      route: `/partner-inquiries/${inquiryId}`,
      metadata: {
        inquiryId,
        agreementRequired: true,
        onboardingUnlocked: false,
      },
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'PARTNER_APPLICATION_APPROVED',
      entityType: 'Partner',
      entityId: partner.id,
      beforeSnapshot: { inquiryId, inquiryStatus: inquiry.status },
      afterSnapshot: {
        status: partner.status,
        assignedToUserId: partner.assignedToUserId,
      },
    });
    return { partner, agreementRequired: true, onboardingUnlocked: false };
  }

  async rejectInquiry(
    user: AuthenticatedUser,
    inquiryId: string,
    dto: ReviewPartnerInquiryDto,
  ) {
    this.assertWrite(user);
    const inquiry = await this.prisma.partnerInquiry.findUnique({
      where: { id: inquiryId },
    });
    if (!inquiry) throw new NotFoundException('Partner inquiry was not found.');
    // ADR-0026 D1 — rejecting a stale application must not end a live partner.
    await this.assertLinkedPartnerNotLive(
      inquiry.partnerId,
      'Rejecting the application',
    );
    const rejected = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.partnerInquiry.update({
        where: { id: inquiryId },
        data: {
          status: PartnerInquiryStatus.REJECTED,
          qualificationNotes: dto.notes,
          assignedToUserId: dto.assignedToUserId,
        },
      });
      if (inquiry.partnerId) {
        await tx.partner.update({
          where: { id: inquiry.partnerId },
          data: { status: PartnerStatus.REJECTED },
        });
        await tx.partnerTimeline.create({
          data: {
            partnerId: inquiry.partnerId,
            eventType: 'PARTNER_APPLICATION_REJECTED',
            actorType: 'PLATFORM_USER',
            actorId: user.userId,
            message: 'Partner application was rejected.',
            metadata: { inquiryId, reason: dto.notes },
          },
        });
      }
      return updated;
    });
    await this.communications.sendEmail({
      eventCode: 'PARTNER_APPLICATION_REJECTED',
      recipient: inquiry.email,
      subject: 'DijiPeople partner application update',
      html: emailPage('Partner application update', dto.notes),
      entityType: 'PartnerInquiry',
      entityId: inquiryId,
      requestedById: user.userId,
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'PARTNER_APPLICATION_REJECTED',
      entityType: 'PartnerInquiry',
      entityId: inquiryId,
      beforeSnapshot: { status: inquiry.status, partnerId: inquiry.partnerId },
      afterSnapshot: { status: rejected.status, reason: dto.notes ?? null },
    });
    return rejected;
  }

  /**
   * Send — or resend — the partner onboarding link (EXECPLAN-0055 WP-05, D6).
   *
   * The recipient is the partner's onboarding contact: `Partner.email`, the
   * primary contact the agreement was signed with. No portal user exists yet
   * at this stage (activation creates it), so there is no other candidate.
   *
   * Each send issues a fresh 32-byte token and stores only its SHA-256 hash on
   * the open application, which revokes the previous link. The email's
   * idempotency key carries that hash: without it every resend produced the
   * same key, the outbox answered "already SENT", and the partner received
   * nothing while the link they already held had just been revoked.
   *
   * The token is never returned, logged or audited. It exists only in the
   * emailed link (and so in the outbound email row the retry worker reads).
   */
  async sendOnboardingInvitation(user: AuthenticatedUser, partnerId: string) {
    this.assertWrite(user);
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        agreements: true,
        onboardingApplications: {
          where: { status: { notIn: ['APPROVED', 'REJECTED'] } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!partner) throw new NotFoundException('Partner was not found.');
    const settings = await this.setting('partner-settings');
    const requiredTypes = readRequiredAgreementTypes(
      settings.requiredAgreementTypes,
      ['PARTNER_AGREEMENT'],
    );
    const agreementsRequired =
      settings.agreementRequiredForOnboarding !== false;
    const missing = agreementsRequired
      ? requiredTypes.filter(
          (type) =>
            !partner.agreements.some(
              (agreement) =>
                agreement.contractType === type &&
                ['FULLY_EXECUTED', 'FULLY_SIGNED', 'ACTIVE'].includes(
                  agreement.status,
                ),
            ),
        )
      : [];
    const current = partner.onboardingApplications[0] ?? null;
    assertOnboardingInvitationAllowed(partner.status, current?.status ?? null, {
      agreementsRequired,
      missingAgreements: missing,
    });
    const recipient = onboardingContactEmail(partner.email);
    if (missing.length)
      throw new AppError('PARTNER_ONBOARDING_AGREEMENT_REQUIRED', {
        message: `Partner onboarding is blocked until these agreements are fully executed: ${missing.join(', ')}.`,
      });
    const now = new Date();
    const sinceLastIssue = current
      ? now.getTime() - current.updatedAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (sinceLastIssue < ONBOARDING_INVITATION_COOLDOWN_MS)
      throw invitationCooldown(
        ONBOARDING_INVITATION_COOLDOWN_MS - sinceLastIssue,
      );

    const expiryDays = boundedNumber(
      settings.onboardingLinkExpiryDays,
      14,
      1,
      90,
    );
    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const expiresAt = addDays(now, expiryDays);
    // Built before anything is written: a missing production URL must fail
    // the request, not leave a rotated token behind it.
    const onboardingUrl = buildPublicSiteUrl(`/partners/onboarding/${token}`);
    const resend = Boolean(current);

    const application = await this.prisma.$transaction(async (tx) => {
      /*
       * Optimistic claims on the partner and on the open application. Two
       * presses of the button read the same `updatedAt`; only one may rotate
       * the token, or the second would revoke the link the first is about to
       * deliver. The loser is told to wait, exactly as the cooldown would.
       */
      const claimed = await tx.partner.updateMany({
        where: {
          id: partnerId,
          status: partner.status,
          updatedAt: partner.updatedAt,
        },
        data: { updatedAt: now },
      });
      if (claimed.count !== 1)
        throw invitationCooldown(ONBOARDING_INVITATION_COOLDOWN_MS);
      if (current) {
        const rotated = await tx.partnerOnboardingApplication.updateMany({
          where: { id: current.id, updatedAt: current.updatedAt },
          data: {
            invitationTokenHash: tokenHash,
            tokenExpiresAt: expiresAt,
            // A resend after "changes requested" keeps that status; the
            // reviewer's request still stands and the partner still owes it.
            status: KEEP_ON_RESEND.has(current.status)
              ? current.status
              : PartnerOnboardingStatus.INVITED,
          },
        });
        if (rotated.count !== 1)
          throw invitationCooldown(ONBOARDING_INVITATION_COOLDOWN_MS);
        return { id: current.id };
      }
      return tx.partnerOnboardingApplication.create({
        data: {
          partnerId,
          invitationTokenHash: tokenHash,
          tokenExpiresAt: expiresAt,
          status: PartnerOnboardingStatus.INVITED,
        },
        select: { id: true },
      });
    });

    let delivery: Awaited<
      ReturnType<PlatformCommunicationsService['sendEmail']>
    >;
    try {
      delivery = await this.communications.sendEmail({
        eventCode: 'PARTNER_ONBOARDING_INVITATION',
        recipient,
        subject: 'Complete your DijiPeople partner onboarding',
        html: emailPage(
          'Complete partner onboarding',
          `Your required agreement is complete. Submit onboarding information within ${expiryDays} days.`,
          { label: 'Complete partner onboarding', url: onboardingUrl },
        ),
        text: `Complete partner onboarding: ${onboardingUrl}`,
        entityType: 'Partner',
        entityId: partnerId,
        requestedById: user.userId,
        idempotencyKey: `partner-onboarding:${application.id}:${tokenHash}`,
      });
    } catch (error) {
      await this.revokeUndeliveredInvitation(current, application.id, null);
      throw error;
    }

    /*
     * `sendEmail` never throws for a provider failure: it records FAILED or
     * REJECTED and returns the row. That return value used to be ignored, so
     * an undelivered invitation was reported to the operator as sent and the
     * partner moved on to the invited state.
     */
    if (delivery.status !== 'SENT') {
      await this.revokeUndeliveredInvitation(
        current,
        application.id,
        delivery.id,
      );
      await this.prisma.partnerTimeline.create({
        data: {
          partnerId,
          eventType: 'PARTNER_ONBOARDING_INVITATION_FAILED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Onboarding link could not be delivered to ${recipient}.`,
          metadata: {
            applicationId: application.id,
            deliveryStatus: delivery.status,
            resend,
          },
        },
      });
      await this.auditService.log({
        tenantId: 'platform',
        actorUserId: user.userId,
        action: AUDIT_ACTIONS.PARTNER_ONBOARDING_INVITATION_FAILED,
        entityType: 'PartnerOnboardingApplication',
        entityId: application.id,
        beforeSnapshot: { partnerStatus: partner.status },
        afterSnapshot: {
          partnerId,
          partnerStatus: partner.status,
          recipient,
          deliveryStatus: delivery.status,
          errorMessage: delivery.errorMessage ?? null,
          resend,
        },
      });
      throw new AppError('PARTNER_INVITATION_DELIVERY_FAILED', {
        message: `The onboarding email to ${recipient} could not be delivered${delivery.errorMessage ? `: ${delivery.errorMessage}` : '.'} The partner was not marked as invited${resend ? ', and the previous link still works' : ''}.`,
      });
    }

    const rule = PARTNER_LIFECYCLE_ACTIONS['send-onboarding-link'];
    const nextStatus =
      partner.status === PartnerStatus.ONBOARDING_IN_PROGRESS
        ? partner.status
        : (rule.to as PartnerStatus);
    await this.prisma.$transaction(async (tx) => {
      // Conditional: a partner suspended while the email was in flight keeps
      // the status it was given rather than being moved back into onboarding.
      await tx.partner.updateMany({
        where: { id: partnerId, status: partner.status },
        data: { status: nextStatus },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId,
          eventType: 'PARTNER_ONBOARDING_INVITED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: resend
            ? `Onboarding link was resent to ${recipient}; the previous link no longer works.`
            : `Onboarding link was sent to ${recipient} after agreement requirements were verified.`,
          metadata: {
            applicationId: application.id,
            recipient,
            expiresAt: expiresAt.toISOString(),
            resend,
            requiredAgreementTypes: requiredTypes,
          },
        },
      });
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: AUDIT_ACTIONS.PARTNER_ONBOARDING_INVITATION_SENT,
      entityType: 'PartnerOnboardingApplication',
      entityId: application.id,
      beforeSnapshot: {
        partnerStatus: partner.status,
        applicationStatus: current?.status ?? null,
      },
      afterSnapshot: {
        partnerId,
        partnerStatus: nextStatus,
        recipient,
        expiresAt,
        resend,
        requiredAgreementTypes: requiredTypes,
      },
    });
    return {
      applicationId: application.id,
      sentTo: recipient,
      expiresAt,
      resend,
      partnerStatus: nextStatus,
      message: `Onboarding link ${resend ? 'resent' : 'sent'} to ${recipient}. It expires on ${formatInvitationDate(expiresAt)}.`,
    };
  }

  /*
   * Undo the token rotation of an invitation that was never delivered. The
   * partner keeps the link they already had (if any), the cooldown does not
   * start, and the failed outbound row is taken off the retry schedule — its
   * link is now dead, so a later automatic retry would deliver a link that
   * cannot work.
   */
  private async revokeUndeliveredInvitation(
    previous: {
      id: string;
      invitationTokenHash: string;
      tokenExpiresAt: Date;
      status: PartnerOnboardingStatus;
      updatedAt: Date;
    } | null,
    applicationId: string,
    deliveryId: string | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (previous)
        await tx.partnerOnboardingApplication.update({
          where: { id: previous.id },
          data: {
            invitationTokenHash: previous.invitationTokenHash,
            tokenExpiresAt: previous.tokenExpiresAt,
            status: previous.status,
            updatedAt: previous.updatedAt,
          },
        });
      else
        await tx.partnerOnboardingApplication.deleteMany({
          where: { id: applicationId, submittedAt: null },
        });
      if (deliveryId)
        await tx.platformOutboundEmail.updateMany({
          where: { id: deliveryId, status: 'FAILED' },
          data: { nextRetryAt: null },
        });
    });
  }

  async getOnboarding(token: string) {
    const application = await this.findOnboarding(token);
    assertOnboardingLinkUsable(application);
    return {
      id: application.id,
      status: application.status,
      partner: {
        displayName: application.partner.displayName,
        type: application.partner.type,
        email: application.partner.email,
      },
      expiresAt: application.tokenExpiresAt,
      latestSubmission: application.submissions[0]?.data ?? null,
    };
  }

  async submitOnboarding(
    token: string,
    dto: SubmitPartnerOnboardingDto,
    ipAddress?: string,
  ) {
    const application = await this.findOnboarding(token);
    assertOnboardingLinkUsable(application);
    const settings = await this.setting('partner-settings');
    validatePartnerOnboardingData(dto.data, settings, application.partner.type);
    /*
     * BUG-3550. `registrationNumber` (COMPANY) / `nationalIdNumber`
     * (INDIVIDUAL) and `taxInformation.taxId` are not columns anywhere — this
     * submission's JSON payload is the only place either value is ever
     * captured, so it is also the only place a collision with another partner
     * can be detected.
     */
    const duplicate = await findOnboardingIdentifierDuplicate(
      this.prisma,
      {
        registrationNumber:
          dto.data.registrationNumber ?? dto.data.nationalIdNumber,
        taxId: (dto.data.taxInformation as Record<string, unknown> | undefined)
          ?.taxId,
      },
      application.partnerId,
    );
    if (duplicate)
      throw new ConflictException(
        duplicate.field === 'taxId'
          ? 'Another partner is already registered with this tax ID.'
          : 'Another partner is already registered with this registration/identification number.',
      );
    const nextVersion = (application.submissions[0]?.version ?? 0) + 1;
    await this.prisma.$transaction([
      this.prisma.partnerOnboardingSubmission.create({
        data: {
          applicationId: application.id,
          version: nextVersion,
          data: dto.data as Prisma.InputJsonValue,
          submittedAt: new Date(),
          submittedFromIp: ipAddress,
        },
      }),
      this.prisma.partnerOnboardingApplication.update({
        where: { id: application.id },
        data: {
          status: PartnerOnboardingStatus.SUBMITTED,
          submittedAt: new Date(),
          version: nextVersion,
        },
      }),
      this.prisma.partner.update({
        where: { id: application.partnerId },
        data: { status: PartnerStatus.SUBMITTED },
      }),
    ]);
    await this.communications.sendEmail({
      eventCode: 'PARTNER_ONBOARDING_SUBMITTED',
      recipient: application.partner.email,
      subject: 'Your partner onboarding was submitted',
      html: emailPage(
        'Onboarding submitted',
        `Application version ${nextVersion} was received and is now awaiting internal review.`,
      ),
      entityType: 'PartnerOnboardingApplication',
      entityId: application.id,
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: null,
      action: 'PARTNER_ONBOARDING_SUBMITTED',
      entityType: 'PartnerOnboardingApplication',
      entityId: application.id,
      afterSnapshot: { partnerId: application.partnerId, version: nextVersion },
    });
    return {
      success: true,
      message: 'Partner onboarding was submitted for review.',
    };
  }

  async listOnboarding(user: AuthenticatedUser) {
    this.assertPlatform(user);
    return {
      items: await this.prisma.partnerOnboardingApplication.findMany({
        include: {
          partner: true,
          submissions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    };
  }

  async reviewOnboarding(
    user: AuthenticatedUser,
    applicationId: string,
    decision: 'approve' | 'changes' | 'reject',
    dto: ReviewPartnerOnboardingDto,
  ) {
    this.assertWrite(user);
    const application =
      await this.prisma.partnerOnboardingApplication.findUnique({
        where: { id: applicationId },
        include: { partner: true },
      });
    if (!application)
      throw new NotFoundException('Partner onboarding was not found.');

    /*
     * The transition check this endpoint never had. Without it every decision
     * was legal from every state in either direction, so an application still
     * in INVITED — nothing submitted, no compliance data — could be approved,
     * and an already-approved application could be flipped to REJECTED after
     * activation, cascading a live partner to REJECTED. BUG-0016.
     */
    const refusal = partnerOnboardingReviewRefusal({
      status: application.status,
      submittedAt: application.submittedAt,
      partnerStatus: application.partner.status,
    });
    if (refusal) throw new BadRequestException(refusal);

    const status =
      decision === 'approve'
        ? PartnerOnboardingStatus.APPROVED
        : decision === 'changes'
          ? PartnerOnboardingStatus.CHANGES_REQUESTED
          : PartnerOnboardingStatus.REJECTED;
    const partnerStatus =
      decision === 'approve'
        ? PartnerStatus.INFORMATION_APPROVED
        : decision === 'changes'
          ? PartnerStatus.ONBOARDING_IN_PROGRESS
          : PartnerStatus.REJECTED;
    await this.prisma.$transaction([
      this.prisma.partnerOnboardingApplication.update({
        where: { id: applicationId },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedById: user.userId,
          reviewNotes: dto.notes,
        },
      }),
      this.prisma.partner.update({
        where: { id: application.partnerId },
        data: { status: partnerStatus },
      }),
    ]);
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: `PARTNER_ONBOARDING_${decision === 'changes' ? 'CHANGES_REQUESTED' : decision.toUpperCase()}`,
      entityType: 'PartnerOnboardingApplication',
      entityId: applicationId,
      beforeSnapshot: {
        status: application.status,
        partnerStatus: application.partner.status,
      },
      afterSnapshot: { status, partnerStatus, notes: dto.notes ?? null },
    });
    await this.communications.sendEmail({
      eventCode:
        decision === 'approve'
          ? 'PARTNER_ONBOARDING_APPROVED'
          : decision === 'changes'
            ? 'PARTNER_ONBOARDING_CHANGES_REQUESTED'
            : 'PARTNER_ONBOARDING_REJECTED',
      recipient: application.partner.email,
      subject:
        decision === 'approve'
          ? 'Partner onboarding approved'
          : decision === 'changes'
            ? 'Changes requested for partner onboarding'
            : 'Partner onboarding decision',
      html: emailPage(
        decision === 'approve' ? 'Information approved' : 'Onboarding update',
        dto.notes ||
          (decision === 'approve'
            ? 'Your information is approved. We will prepare the partner agreement next.'
            : 'Please contact the DijiPeople partner team for details.'),
      ),
      entityType: 'PartnerOnboardingApplication',
      entityId: applicationId,
      requestedById: user.userId,
    });
    return { success: true, status };
  }

  async activatePartner(user: AuthenticatedUser, partnerId: string) {
    this.assertWrite(user);
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        onboardingApplications: { orderBy: { createdAt: 'desc' }, take: 1 },
        agreements: {
          where: {
            contractType: {
              in: [
                ContractType.PARTNER_AGREEMENT,
                ContractType.MASTER_PARTNER_AGREEMENT,
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!partner) throw new NotFoundException('Partner was not found.');
    /*
     * ADR-0026. Activation had no status guard: run against an ACTIVE partner
     * it re-sent the portal invitation and reset a live account to INVITED.
     * The from-states are the shared table the admin uses to offer the button.
     */
    partnerTransition(partner.status, 'activate');
    if (
      partner.onboardingApplications[0]?.status !==
      PartnerOnboardingStatus.APPROVED
    )
      throw new BadRequestException(
        'Partner onboarding must be approved before activation.',
      );
    const agreement = partner.agreements[0];
    if (
      !agreement ||
      !new Set<ContractStatus>([
        ContractStatus.FULLY_SIGNED,
        ContractStatus.FULLY_EXECUTED,
        ContractStatus.ACTIVE,
      ]).has(agreement.status)
    )
      throw new BadRequestException(
        'A fully signed partner agreement is required before activation.',
      );
    const invitationToken = randomBytes(32).toString('base64url');
    const defaultLink = await this.prisma.partnerReferralLink.findFirst({
      where: { partnerId, isDefault: true, status: 'ACTIVE' },
    });
    const referralCode = partnerReference();
    const portalUser = await this.prisma.$transaction(async (tx) => {
      await tx.partner.update({
        where: { id: partnerId },
        data: {
          status: PartnerStatus.ACTIVE,
          accountStatus: 'INVITED',
        },
      });
      if (!defaultLink)
        await tx.partnerReferralLink.create({
          data: {
            partnerId,
            name: 'Default referral link',
            code: referralCode,
            targetPath: '/request-demo',
            isDefault: true,
            createdById: user.userId,
          },
        });
      await tx.partnerTimeline.create({
        data: {
          partnerId,
          eventType: 'PARTNER_ACCOUNT_ACTIVATION_INVITED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: 'Partner account activation invitation was sent.',
          metadata: { agreementId: agreement.id },
        },
      });
      return tx.partnerPortalUser.upsert({
        where: { email: partner.email.toLowerCase() },
        create: {
          partnerId,
          email: partner.email.toLowerCase(),
          firstName: partner.contactFirstName ?? 'Partner',
          lastName: partner.contactLastName ?? 'User',
          passwordHash: '!INVITED!',
          status: 'INVITED',
          invitationTokenHash: sha256(invitationToken),
          invitationExpiresAt: addDays(new Date(), 7),
        },
        update: {
          partnerId,
          status: 'INVITED',
          invitationTokenHash: sha256(invitationToken),
          invitationExpiresAt: addDays(new Date(), 7),
        },
      });
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'PARTNER_ACTIVATED',
      entityType: 'Partner',
      entityId: partnerId,
      beforeSnapshot: {
        status: partner.status,
        accountStatus: partner.accountStatus,
      },
      afterSnapshot: {
        status: PartnerStatus.ACTIVE,
        accountStatus: 'INVITED',
        portalUserId: portalUser.id,
      },
    });
    const activationUrl = buildPublicSiteUrl(
      `/partners/activate/${invitationToken}`,
    );
    await this.communications.sendEmail({
      eventCode: 'PARTNER_ACTIVATION_INVITATION',
      recipient: partner.email,
      subject: 'Activate your DijiPeople partner portal',
      html: emailPage(
        'Partner account ready',
        'Your signed agreement has been verified and your partner account is ready. Set a password to activate portal access.',
        { label: 'Activate partner portal', url: activationUrl },
      ),
      text: `Activate your partner portal: ${activationUrl}`,
      entityType: 'Partner',
      entityId: partnerId,
      requestedById: user.userId,
      idempotencyKey: `partner-activation:${portalUser.id}:${portalUser.invitationTokenHash}`,
    });
    /*
     * EXECPLAN-0055 WP-05 — the raw invitation token is no longer returned. It
     * is a credential for the partner's portal account; the operator's console
     * never needed it, and returning it put it in browser history and proxies.
     */
    return {
      partnerId,
      portalUserId: portalUser.id,
      sentTo: partner.email,
      expiresAt: portalUser.invitationExpiresAt,
    };
  }

  async activatePortalUser(token: string, password: string) {
    const user = await this.prisma.partnerPortalUser.findUnique({
      where: { invitationTokenHash: sha256(token) },
    });
    if (
      !user ||
      !user.invitationExpiresAt ||
      user.invitationExpiresAt < new Date()
    )
      throw new BadRequestException(
        'Partner activation link is invalid or expired.',
      );
    await this.prisma.$transaction([
      this.prisma.partnerPortalUser.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(password, 12),
          status: 'ACTIVE',
          activatedAt: new Date(),
          invitationTokenHash: null,
          invitationExpiresAt: null,
        },
      }),
      /*
       * ADR-0026 D2 — only an INVITED account becomes ACTIVE here. A partner
       * suspended or deactivated after the invitation was sent keeps that
       * account status when the contact later accepts the stale link.
       */
      this.prisma.partner.updateMany({
        where: { id: user.partnerId, accountStatus: 'INVITED' },
        data: { accountStatus: 'ACTIVE' },
      }),
      this.prisma.partnerTimeline.create({
        data: {
          partnerId: user.partnerId,
          eventType: 'PARTNER_ACCOUNT_ACTIVATED',
          actorType: 'PARTNER_USER',
          actorId: user.id,
          message: 'Partner account activated.',
        },
      }),
    ]);
    return { success: true, message: 'Partner portal account activated.' };
  }

  async login(dto: PartnerLoginDto) {
    const user = await this.prisma.partnerPortalUser.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { partner: true },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.partner.status !== PartnerStatus.ACTIVE ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    )
      throw new UnauthorizedException('Invalid partner portal credentials.');
    return this.issueTokens(user);
  }

  async refresh(dto: PartnerRefreshDto) {
    const hash = sha256(dto.refreshToken);
    const token = await this.prisma.partnerRefreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: { partner: true } } },
    });
    if (
      !token ||
      token.revokedAt ||
      token.expiresAt < new Date() ||
      token.user.status !== 'ACTIVE' ||
      token.user.partner.status !== PartnerStatus.ACTIVE
    )
      throw new UnauthorizedException('Partner refresh token is invalid.');
    await this.prisma.partnerRefreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(token.user);
  }

  async me(actor: PartnerActor) {
    const user = await this.assertPartnerActor(actor);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      partner: user.partner,
    };
  }

  async listPartnerLeads(actor: PartnerActor) {
    await this.assertPartnerActor(actor);
    const leads = await this.prisma.lead.findMany({
      where: { partnerId: actor.partnerId },
      select: {
        id: true,
        companyName: true,
        fullName: true,
        industry: true,
        companySize: true,
        country: true,
        status: true,
        subStatus: true,
        referralCodeSnapshot: true,
        referredAt: true,
        createdAt: true,
        updatedAt: true,
        partnerReferralLink: {
          select: { id: true, name: true, code: true, campaignName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: leads.map((lead) => ({
        id: lead.id,
        status: lead.status,
        lead,
      })),
    };
  }

  async listPartnerReferralLinks(actor: PartnerActor) {
    await this.assertPartnerActor(actor);
    return {
      items: await this.prisma.partnerReferralLink.findMany({
        where: { partnerId: actor.partnerId },
        select: {
          id: true,
          name: true,
          code: true,
          targetPath: true,
          campaignName: true,
          isDefault: true,
          status: true,
          expiresAt: true,
          lastUsedAt: true,
          submissionCount: true,
          createdAt: true,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
    };
  }

  async createPartnerReferralLink(
    actor: PartnerActor,
    dto: CreatePartnerPortalReferralLinkDto,
  ) {
    const user = await this.assertPartnerActor(actor);
    const settings = await this.setting('partner-settings');
    if (settings.allowPartnerCampaignLinks !== true)
      throw new ForbiddenException(
        'Additional campaign links are not enabled for Partner users.',
      );
    const activeLinkCount = await this.prisma.partnerReferralLink.count({
      where: { partnerId: actor.partnerId, status: 'ACTIVE' },
    });
    const maximum =
      typeof settings.maximumActiveReferralLinks === 'number'
        ? Math.max(1, Math.floor(settings.maximumActiveReferralLinks))
        : 10;
    if (activeLinkCount >= maximum)
      throw new BadRequestException(
        `Your organization can have up to ${maximum} active referral links.`,
      );
    let code = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = partnerReference();
      const exists = await this.prisma.partnerReferralLink.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!exists) {
        code = candidate;
        break;
      }
    }
    if (!code)
      throw new BadRequestException(
        'A referral code could not be generated. Please try again.',
      );
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date())
      throw new BadRequestException(
        'Referral link expiry must be in the future.',
      );
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.partnerReferralLink.create({
        data: {
          partnerId: actor.partnerId,
          name: dto.name.trim(),
          campaignName: clean(dto.campaignName),
          targetPath: '/request-demo',
          expiresAt,
          code,
          createdById: user.id,
        },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId: actor.partnerId,
          eventType: 'REFERRAL_LINK_CREATED',
          actorType: 'PARTNER_USER',
          actorId: user.id,
          message: `Referral link ${link.name} was created by a Partner user.`,
          metadata: {
            referralLinkId: link.id,
            campaignName: link.campaignName,
          },
        },
      });
      return link;
    });
  }

  async listPartnerContracts(actor: PartnerActor) {
    await this.assertPartnerActor(actor);
    return {
      items: await this.prisma.contract.findMany({
        where: { partnerId: actor.partnerId },
        select: {
          id: true,
          contractNumber: true,
          title: true,
          contractType: true,
          status: true,
          effectiveDate: true,
          expiryDate: true,
          updatedAt: true,
          signatureRequests: {
            select: {
              id: true,
              requestNumber: true,
              status: true,
              expiresAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    };
  }

  async getPartnerContract(actor: PartnerActor, contractId: string) {
    await this.assertPartnerActor(actor);
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, partnerId: actor.partnerId },
      select: {
        id: true,
        contractNumber: true,
        title: true,
        contractType: true,
        status: true,
        counterpartyName: true,
        effectiveDate: true,
        expiryDate: true,
        currentVersionNumber: true,
        updatedAt: true,
        signatureRequests: {
          select: {
            id: true,
            requestNumber: true,
            status: true,
            sentAt: true,
            expiresAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!contract)
      throw new NotFoundException('Partner agreement was not found.');
    return contract;
  }

  async createPartnerLead(actor: PartnerActor, dto: PartnerLeadDto) {
    await this.assertPartnerActor(actor);
    void dto;
    throw new ForbiddenException(
      'Partners cannot create leads manually. Share an active referral link to the public request-demo form.',
    );
  }

  async updatePartnerLead(
    actor: PartnerActor,
    reviewId: string,
    dto: PartnerLeadDto,
  ) {
    await this.assertPartnerActor(actor);
    void reviewId;
    void dto;
    throw new ForbiddenException('Partners cannot edit attributed leads.');
  }

  async submitPartnerLead(actor: PartnerActor, reviewId: string) {
    await this.assertPartnerActor(actor);
    void reviewId;
    throw new ForbiddenException('Partners cannot submit leads manually.');
  }

  async reviewPartnerLead(
    user: AuthenticatedUser,
    reviewId: string,
    decision: 'approve' | 'changes' | 'reject',
    dto: ReviewPartnerLeadDto,
  ) {
    this.assertWrite(user);
    const review = await this.prisma.partnerLeadReview.findUnique({
      where: { id: reviewId },
      include: { partner: true, lead: true },
    });
    if (!review)
      throw new NotFoundException('Partner lead submission was not found.');
    const status =
      decision === 'approve'
        ? PartnerLeadReviewStatus.APPROVED
        : decision === 'changes'
          ? PartnerLeadReviewStatus.CHANGES_REQUESTED
          : PartnerLeadReviewStatus.REJECTED;
    await this.prisma.partnerLeadReview.update({
      where: { id: reviewId },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedById: user.userId,
        reviewerNotes: decision === 'reject' ? undefined : dto.notes,
        rejectionReason: decision === 'reject' ? dto.notes : undefined,
        approvedAt: decision === 'approve' ? new Date() : undefined,
        lockedAt: decision === 'changes' ? null : undefined,
      },
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: `PARTNER_LEAD_REVIEW_${decision === 'changes' ? 'CHANGES_REQUESTED' : decision.toUpperCase()}`,
      entityType: 'PartnerLeadReview',
      entityId: reviewId,
      beforeSnapshot: { status: review.status },
      afterSnapshot: { status, notes: dto.notes ?? null },
    });
    await this.communications.sendEmail({
      eventCode: `PARTNER_LEAD_${decision.toUpperCase()}`,
      recipient: review.partner.email,
      subject: `Lead review update: ${review.lead.companyName}`,
      html: emailPage(
        `Lead ${decision === 'approve' ? 'approved' : decision === 'changes' ? 'requires changes' : 'rejected'}`,
        dto.notes ||
          `The lead submission for ${review.lead.companyName} was ${decision}.`,
      ),
      entityType: 'PartnerLeadReview',
      entityId: reviewId,
      requestedById: user.userId,
    });
    return { success: true, status };
  }

  private async issueTokens(user: {
    id: string;
    partnerId: string;
    email: string;
    firstName: string;
    lastName: string;
  }) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        partnerId: user.partnerId,
        email: user.email,
        actorType: 'PARTNER',
      },
      { expiresIn: '30m' },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.partnerRefreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: addDays(new Date(), 30),
      },
    });
    await this.prisma.partnerPortalUser.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: 1800,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        partnerId: user.partnerId,
      },
    };
  }

  private async assertPartnerActor(actor: PartnerActor) {
    const user = await this.prisma.partnerPortalUser.findFirst({
      where: {
        id: actor.userId,
        partnerId: actor.partnerId,
        status: 'ACTIVE',
        partner: { status: PartnerStatus.ACTIVE },
      },
      include: { partner: true },
    });
    if (!user)
      throw new UnauthorizedException(
        'Partner portal access is no longer active.',
      );
    return user;
  }

  private async assertLinkedPartnerNotLive(
    partnerId: string | null,
    step: string,
  ) {
    if (!partnerId) return;
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { status: true },
    });
    if (partner) assertPartnerNotLive(partner.status, step);
  }

  private async setting(key: string) {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key },
    });
    return row?.value &&
      typeof row.value === 'object' &&
      !Array.isArray(row.value)
      ? (row.value as Record<string, unknown>)
      : {};
  }

  private async notifyPartnerTeam(
    eventCode: string,
    subject: string,
    message: string,
    partnerId: string,
  ) {
    const recipients = await this.prisma.platformUser.findMany({
      where: {
        status: 'ACTIVE',
        role: {
          in: [
            'SUPER_ADMIN',
            'PLATFORM_OWNER',
            'PLATFORM_ADMIN',
            'PARTNER_MANAGER',
          ],
        },
      },
      select: { id: true, email: true },
    });
    await Promise.all(
      recipients.map((recipient) =>
        this.communications.sendEmail({
          eventCode,
          recipient: recipient.email,
          subject,
          html: emailPage(subject, message),
          entityType: 'Partner',
          entityId: partnerId,
          idempotencyKey: `${eventCode}:${partnerId}:${recipient.id}`,
        }),
      ),
    );
  }

  private async partnerReview(partnerId: string, reviewId: string) {
    const review = await this.prisma.partnerLeadReview.findFirst({
      where: { id: reviewId, partnerId },
      include: { lead: true },
    });
    if (!review) throw new NotFoundException('Partner lead was not found.');
    return review;
  }

  private async findOnboarding(token: string) {
    const application =
      await this.prisma.partnerOnboardingApplication.findUnique({
        where: { invitationTokenHash: sha256(token) },
        include: {
          partner: true,
          submissions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });
    // Unknown, replaced (resent) and never-issued links are indistinguishable.
    if (!application)
      throw new AppError('PARTNER_ONBOARDING_LINK_INVALID', {
        message:
          'This onboarding link is not valid. It may have been replaced by a newer link — use the most recent onboarding email.',
      });
    return application;
  }

  private assertPlatform(user: AuthenticatedUser) {
    if (!user.platform?.id)
      throw new ForbiddenException('Platform access is required.');
    if (!userHasPlatformPermission(user, 'partners.read'))
      throw new ForbiddenException('Partner access is required.');
  }

  private assertWrite(user: AuthenticatedUser) {
    this.assertPlatform(user);
    if (!userHasPlatformPermission(user, 'partners.manage'))
      throw new ForbiddenException('Partner management access is required.');
  }
}

/**
 * BUG-3549. This used to apply one required-field list to every applicant
 * regardless of `type`, so an INDIVIDUAL applicant was asked for
 * `registrationNumber` — a company registration number nobody without a
 * company has. The required-field list itself now lives in
 * `partner-type-policy.ts`, keyed by type, so this stays a thin wrapper that
 * adds the one rule that is not a field-presence check.
 */
export function validatePartnerOnboardingData(
  data: Record<string, unknown>,
  settings: Record<string, unknown> = {},
  type: PartnerType = PartnerType.COMPANY,
) {
  const missing = missingOnboardingFields(type, data, settings);
  if (missing.length)
    throw new BadRequestException(
      `Required onboarding fields are missing: ${missing.join(', ')}.`,
    );
  if (data.privacyConsent !== true)
    throw new BadRequestException('Privacy consent is required.');
}

function clean(value: string | undefined) {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function reference(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function partnerReference() {
  return `DP-P-${randomBytes(6)
    .toString('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)}`;
}

function partnerApplicationSnapshot(dto: CreatePartnerInquiryDto) {
  return {
    type: dto.type,
    companyName: clean(dto.companyName) ?? null,
    contactFirstName: dto.contactFirstName.trim(),
    contactLastName: dto.contactLastName.trim(),
    email: dto.email.trim().toLowerCase(),
    phone: clean(dto.phone) ?? null,
    country: clean(dto.country) ?? null,
    website: clean(dto.website) ?? null,
    message: clean(dto.message) ?? null,
    source: clean(dto.source) ?? 'public-website',
    consentAccepted: true,
  };
}

function readRequiredAgreementTypes(
  value: unknown,
  fallback: ContractType[],
): ContractType[] {
  const allowed = new Set(Object.values(ContractType));
  const values = Array.isArray(value)
    ? value.filter(
        (item): item is ContractType =>
          typeof item === 'string' && allowed.has(item as ContractType),
      )
    : [];
  return values.length ? [...new Set(values)] : fallback;
}

/*
 * Why 60 seconds: every send rotates the token, so a second press while the
 * first email is still in flight revokes the link that email carries. A minute
 * absorbs double-clicks and impatient retries without holding up an operator
 * who has just corrected a mistyped contact email and wants to resend.
 */
const ONBOARDING_INVITATION_COOLDOWN_MS = 60_000;

/** Application statuses a resend preserves instead of resetting to INVITED. */
const KEEP_ON_RESEND = new Set<PartnerOnboardingStatus>([
  PartnerOnboardingStatus.IN_PROGRESS,
  PartnerOnboardingStatus.CHANGES_REQUESTED,
]);

/** An application in these statuses is waiting on a reviewer, not the partner. */
const AWAITING_REVIEW = new Set<PartnerOnboardingStatus>([
  PartnerOnboardingStatus.SUBMITTED,
  PartnerOnboardingStatus.UNDER_REVIEW,
]);

const INVITATION_CLOSED_STATUSES = new Set<string>([
  'SUSPENDED',
  'INACTIVE',
  'TERMINATED',
  'REJECTED',
]);

/*
 * The contracting statuses before the agreement is executed. The shared table
 * does not offer the link here, because the default configuration requires an
 * executed agreement. With `agreementRequiredForOnboarding: false` (a platform
 * setting, not exposed in the console) the link may go out from these too.
 */
const PRE_AGREEMENT_STATUSES = new Set<string>([
  'APPROVED_AWAITING_AGREEMENT',
  'AGREEMENT_DRAFTING',
  'INTERNAL_APPROVAL',
  'AGREEMENT_IN_PROGRESS',
  'AWAITING_SIGNATURE',
]);

/**
 * Whether the onboarding link may be sent from `status`, refused with the
 * domain code that names the reason. Exported for its spec.
 */
export function assertOnboardingInvitationAllowed(
  status: PartnerStatus,
  applicationStatus: PartnerOnboardingStatus | null,
  agreements: { agreementsRequired: boolean; missingAgreements: string[] },
): void {
  const label = partnerStatusLabel(status);
  if (
    (PARTNER_ONBOARDED_STATUSES as readonly string[]).includes(status) ||
    (applicationStatus && AWAITING_REVIEW.has(applicationStatus))
  )
    throw new AppError('PARTNER_ALREADY_ONBOARDED', {
      message: `An onboarding link is not needed: the partner is ${label} and has already submitted onboarding.`,
    });
  if (INVITATION_CLOSED_STATUSES.has(status))
    throw new AppError('PARTNER_INVITATION_NOT_ALLOWED', {
      message: `An onboarding link cannot be sent while the partner is ${label}.`,
    });
  if (canApplyPartnerAction('send-onboarding-link', status)) return;
  if (PRE_AGREEMENT_STATUSES.has(status)) {
    if (!agreements.agreementsRequired) return;
    throw new AppError('PARTNER_ONBOARDING_AGREEMENT_REQUIRED', {
      message: `Partner onboarding is blocked until these agreements are fully executed: ${agreements.missingAgreements.join(', ') || 'the partner agreement'}.`,
    });
  }
  throw new AppError('PARTNER_ACTION_NOT_AVAILABLE', {
    message: `The onboarding link is available once the partner agreement is executed. The partner is ${label}.`,
  });
}

/** The onboarding contact's address, normalised, or a refusal naming why not. */
export function onboardingContactEmail(email: string | null | undefined) {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized)
    throw new AppError('PARTNER_ONBOARDING_CONTACT_MISSING', {
      message:
        'The partner has no contact email to send the onboarding link to. Add one, then send the link again.',
    });
  if (!isEmail(normalized))
    throw new AppError('PARTNER_ONBOARDING_CONTACT_INVALID', {
      message: `The partner's contact email "${normalized}" is not a valid email address. Correct it, then send the link again.`,
    });
  return normalized;
}

function invitationCooldown(remainingMs: number) {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return new AppError('PARTNER_INVITATION_COOLDOWN', {
    message: `An onboarding link was sent to this partner moments ago. Wait ${seconds} seconds before sending another.`,
    details: { retryAfterSeconds: seconds },
  });
}

/** Refuse a link whose application is decided or whose token has expired. */
function assertOnboardingLinkUsable(application: {
  status: PartnerOnboardingStatus;
  tokenExpiresAt: Date;
}) {
  if (
    application.status === PartnerOnboardingStatus.APPROVED ||
    application.status === PartnerOnboardingStatus.REJECTED
  )
    throw new AppError('PARTNER_ONBOARDING_CLOSED', {
      message:
        'This onboarding application has already been decided, so the link no longer accepts changes.',
    });
  if (application.tokenExpiresAt < new Date())
    throw new AppError('PARTNER_ONBOARDING_LINK_EXPIRED', {
      message:
        'This onboarding link has expired. Ask the DijiPeople partner team to send a new link.',
    });
}

function formatInvitationDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}
