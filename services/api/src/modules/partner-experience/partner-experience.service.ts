import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ContractStatus,
  ContractType,
  PartnerInquiryStatus,
  PartnerLeadReviewStatus,
  PartnerOnboardingStatus,
  PartnerStatus,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
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

@Injectable()
export class PartnerExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly communications: PlatformCommunicationsService,
    private readonly events: PlatformEventsService,
  ) {}

  async submitInquiry(dto: CreatePartnerInquiryDto, correlationId?: string) {
    if (!dto.consentAccepted)
      throw new BadRequestException('Privacy consent is required.');
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
          privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
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
              type: inquiry.type,
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
    return rejected;
  }

  async sendOnboardingInvitation(user: AuthenticatedUser, partnerId: string) {
    this.assertWrite(user);
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: { agreements: true },
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
    if (missing.length)
      throw new BadRequestException(
        `Partner onboarding is blocked until these agreements are fully executed: ${missing.join(', ')}.`,
      );
    const expiryDays = boundedNumber(
      settings.onboardingLinkExpiryDays,
      14,
      1,
      90,
    );
    const token = randomBytes(32).toString('base64url');
    const expiresAt = addDays(new Date(), expiryDays);
    const application = await this.prisma.$transaction(async (tx) => {
      const current = await tx.partnerOnboardingApplication.findFirst({
        where: { partnerId, status: { notIn: ['APPROVED', 'REJECTED'] } },
        orderBy: { updatedAt: 'desc' },
      });
      const item = current
        ? await tx.partnerOnboardingApplication.update({
            where: { id: current.id },
            data: {
              invitationTokenHash: sha256(token),
              tokenExpiresAt: expiresAt,
              status: PartnerOnboardingStatus.INVITED,
            },
          })
        : await tx.partnerOnboardingApplication.create({
            data: {
              partnerId,
              invitationTokenHash: sha256(token),
              tokenExpiresAt: expiresAt,
              status: PartnerOnboardingStatus.INVITED,
            },
          });
      await tx.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ONBOARDING_PENDING },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId,
          eventType: 'PARTNER_ONBOARDING_INVITED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message:
            'Partner onboarding invitation was sent after agreement requirements were verified.',
          metadata: {
            applicationId: item.id,
            requiredAgreementTypes: requiredTypes,
          },
        },
      });
      return item;
    });
    const onboardingUrl = buildPublicSiteUrl(`/partners/onboarding/${token}`);
    await this.communications.sendEmail({
      eventCode: 'PARTNER_ONBOARDING_INVITATION',
      recipient: partner.email,
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
    });
    return {
      applicationId: application.id,
      onboardingToken: token,
      onboardingPath: `/partners/onboarding/${token}`,
      expiresAt,
    };
  }

  async getOnboarding(token: string) {
    const application = await this.findOnboarding(token);
    if (application.tokenExpiresAt < new Date())
      throw new BadRequestException('Onboarding link has expired.');
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
    if (application.tokenExpiresAt < new Date())
      throw new BadRequestException('Onboarding link has expired.');
    if (
      new Set<PartnerOnboardingStatus>([
        PartnerOnboardingStatus.APPROVED,
        PartnerOnboardingStatus.REJECTED,
      ]).has(application.status)
    )
      throw new BadRequestException('This onboarding application is closed.');
    validatePartnerOnboardingData(
      dto.data,
      await this.setting('partner-settings'),
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
    return {
      partnerId,
      portalUserId: portalUser.id,
      invitationToken,
      activationPath: `/partners/activate/${invitationToken}`,
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
      this.prisma.partner.update({
        where: { id: user.partnerId },
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
    if (!application)
      throw new NotFoundException(
        'Partner onboarding invitation was not found.',
      );
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

export function validatePartnerOnboardingData(
  data: Record<string, unknown>,
  settings: Record<string, unknown> = {},
) {
  const required = [
    'legalName',
    'registrationNumber',
    'registeredAddress',
    'authorizedSigner',
    'privacyConsent',
  ];
  if (settings.requireTaxInformation !== false) required.push('taxInformation');
  if (settings.requireBankInformation !== false)
    required.push('bankingInformation');
  const missing = required.filter(
    (key) => data[key] === undefined || data[key] === null || data[key] === '',
  );
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
