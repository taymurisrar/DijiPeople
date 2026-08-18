import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeadAttributionStatus,
  LegalDocumentType,
  LeadInquiryIntent,
  LeadStatus,
  PartnerReferralLinkStatus,
  PartnerStatus,
  PlatformUserRole,
  PlatformUserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  BulkAssignLeadsDto,
  CorrectLeadAttributionDto,
  CreateAdminLeadDto,
  LeadContractingTermsDto,
  LeadQueryDto,
  UpdateAdminLeadDto,
} from './dto/admin-lead.dto';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { LegalService } from '../legal/legal.service';
import {
  CURRENT_PRIVACY_NOTICE_VERSION,
  LEAD_INQUIRY_INTENT_OPTIONS,
} from './acquisition.catalog';
import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';
import { createHash } from 'node:crypto';
import { LeadsRepository } from './leads.repository';
import {
  getDefaultSubStatus,
  getEntityStageDefinition,
  getRequiredCriteria,
  getSubStatusOptions,
  isValidLeadSource,
  isValidSubStatus,
  isValidTransition,
  normalizeLeadSource,
} from '../super-admin/platform-lifecycle.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformCommunicationsService } from '../platform-communications/platform-communications.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import {
  executedGoverningAgreementWhere,
  GOVERNING_AGREEMENT_REQUIRED_MESSAGE,
  leadAgreementScope,
} from '../contracts/governing-agreement';

/**
 * How long a website enquiry from the same company and address is treated as the
 * same enquiry (ITEM-0007).
 *
 * 24 hours is a product decision, not a technical one — it says "the same
 * company asking again today is one conversation, asking again next week is
 * two". It matches the partner inquiry form on the same public surface, which is
 * the asymmetry the item was raised about.
 */
const LEAD_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LeadsService {
  constructor(
    private readonly leadsRepository: LeadsRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly communications: PlatformCommunicationsService,
    private readonly events: PlatformEventsService,
    private readonly legalService: LegalService,
  ) {}

  async submitLead(dto: SubmitLeadDto, correlationId?: string) {
    if (dto.website?.trim()) {
      return { submitted: true };
    }

    const submittedAt = new Date();
    const interestAreas = this.normalizeInterestAreas(dto.interestAreas);

    // Transport-duplicate guard. A double click or a client retry produces the
    // same hash within the window and is absorbed; the same person asking a
    // different question, or the same question months later, hashes differently
    // and is a genuinely new inquiry.
    const submissionHash = buildSubmissionHash(dto, submittedAt);

    const existing = await this.prisma.lead.findUnique({
      where: { submissionHash },
      select: { id: true },
    });

    if (existing) {
      // Idempotent, and deliberately indistinguishable from a first submission
      // to the caller: a visitor who double-clicked should see success, not an
      // error about a duplicate.
      return { submitted: true, id: existing.id };
    }

    /*
     * ITEM-0007 — the *business* duplicate, decided rather than inferred.
     *
     * The hash above only absorbs a transport duplicate: identical content in
     * the same hour. It leaves the case sales actually complained about — the
     * same company enquiring twice in a day, from two people or with slightly
     * different wording — as two rows nobody can tell apart from genuine
     * demand. The partner inquiry form on the same public surface already
     * deduplicated and this one did not, and nothing recorded which behaviour
     * was intended.
     *
     * The decision is a 24-hour window keyed on work e-mail and company, which
     * is the partner form's behaviour. A rolling window rather than a wider
     * bucket: a day bucket would treat 23:59 and 00:01 as distinct while
     * collapsing 00:01 and 23:59, and at 24-hour granularity that boundary is
     * far more visible than it is at one hour.
     *
     * This does not replace the hash. The hash is a unique constraint and so
     * survives two *concurrent* identical submissions; a read-then-write window
     * cannot. They answer different questions and both are kept.
     */
    const duplicate = await this.findRecentDuplicateLead(dto, submittedAt);
    if (duplicate) {
      return { submitted: true, id: duplicate.id };
    }

    const referral = await this.resolveReferral(dto.referralCode);

    // The notice actually in force, resolved from the published legal
    // documents rather than from a compile-time constant. Falls back to that
    // constant only while nothing is published, so a submission made before
    // launch still records which wording was shown instead of recording
    // nothing at all.
    const publishedNotice = await this.legalService.resolvePublished(
      LegalDocumentType.PRIVACY_POLICY,
      null,
    );
    const privacyNoticeVersion = publishedNotice
      ? `v${publishedNotice.version}`
      : CURRENT_PRIVACY_NOTICE_VERSION;

    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await this.leadsRepository.create(
        {
          contactFirstName: dto.firstName.trim(),
          // Null rather than a placeholder. The form used to send "Contact" as
          // a surname for anyone who gave a single name.
          contactLastName: dto.lastName?.trim() || null,
          fullName: [dto.firstName.trim(), dto.lastName?.trim()]
            .filter(Boolean)
            .join(' '),
          companyName: dto.companyName,
          workEmail: dto.workEmail,
          phoneNumber: dto.phoneNumber ?? null,
          // Passed through as given. These used to be required, so the contact
          // form invented "General HR operations" and "Unknown" to satisfy them
          // — BUG-0021. A field the visitor did not fill in stays null.
          industry: dto.industry ?? null,
          companySize: dto.companySize ?? null,
          country: dto.country ?? null,
          requirementsSummary: dto.message ?? null,
          message: dto.message ?? null,
          // `interestArea` used to be written here, which conflated "which
          // modules interest you" with "which plan do you want". They are
          // different questions and now have different columns.
          interestedPlan: dto.interestedPlan ?? null,
          inquiryIntent: dto.inquiryIntent ?? null,
          interestAreas: interestAreas,
          sourcePage: dto.sourcePage ?? null,
          referrerUrl: dto.referrerUrl ?? null,
          utmSource: dto.utmSource ?? null,
          utmMedium: dto.utmMedium ?? null,
          utmCampaign: dto.utmCampaign ?? null,
          utmContent: dto.utmContent ?? null,
          utmTerm: dto.utmTerm ?? null,
          correlationId: correlationId ?? null,
          // The server records which notice was in force. A client-supplied
          // version could claim any notice at all.
          privacyNoticeVersion,
          privacyNoticeAcceptedAt: submittedAt,
          // Optional and separate. Submitting an inquiry never requires it.
          marketingConsent: dto.marketingConsent === true,
          marketingConsentAt:
            dto.marketingConsent === true ? submittedAt : null,
          submissionHash,
          source: referral.partnerId ? 'Partner Referral' : 'Website',
          status: LeadStatus.NEW,
          // Derived from what they actually asked for. This was hardcoded to
          // 'Demo requested' for every lead, including contact-form inquiries
          // that were nothing of the kind.
          subStatus: describeIntent(dto.inquiryIntent),
          partnerId: referral.partnerId,
          partnerReferralLinkId: referral.linkId,
          referralCodeSnapshot: referral.code,
          referralSource: dto.referralCode ? 'PUBLIC_REQUEST_DEMO' : null,
          referredAt: dto.referralCode ? new Date() : null,
          attributionStatus: referral.status,
        },
        tx,
      );
      if (referral.linkId) {
        await tx.partnerReferralLink.update({
          where: { id: referral.linkId },
          data: { submissionCount: { increment: 1 }, lastUsedAt: new Date() },
        });
      }
      if (referral.partnerId) {
        await tx.partnerTimeline.create({
          data: {
            partnerId: referral.partnerId,
            eventType: 'REFERRAL_LEAD_CAPTURED',
            actorType: 'PUBLIC',
            message: `Referral captured for ${created.companyName}.`,
            metadata: { leadId: created.id, referralCode: referral.code },
          },
        });
      }
      // Written in the same transaction as the lead. A lead that exists
      // without the acknowledgement that justified contacting them is exactly
      // the split state that makes consent unprovable, and it is the state you
      // get whenever the two writes are allowed to fail independently.
      if (publishedNotice) {
        await this.legalService.acknowledge(
          {
            legalDocumentVersionId: publishedNotice.versionId,
            source: 'landing:contact',
            leadId: created.id,
            subjectEmail: created.workEmail,
          },
          tx,
        );
      }

      return created;
    });

    await this.notifyLeadSubmitted(
      lead.id,
      lead.companyName,
      referral.partnerId,
    );

    await this.events.record({
      eventCode: 'LEAD_SUBMITTED',
      source: 'LANDING',
      correlationId,
      entityType: 'Lead',
      entityId: lead.id,
      route: '/public/leads',
      actorType: 'PUBLIC_VISITOR',
      metadata: {
        result: 'created',
        source: lead.source,
        attributionStatus: lead.attributionStatus,
        partnerAttributed: Boolean(referral.partnerId),
        inquiryIntent: lead.inquiryIntent,
        interestAreas: lead.interestAreas,
        sourcePage: lead.sourcePage,
        utmSource: lead.utmSource,
        utmCampaign: lead.utmCampaign,
        country: lead.country,
        marketingConsent: lead.marketingConsent,
      },
    });

    return {
      submitted: true,
      id: lead.id,
    };
  }

  /**
   * Keep only interest areas that name a real DijiPeople capability.
   *
   * Checked against the live feature catalogue — the same list the product
   * gates modules on — rather than a copy. An unknown key is dropped rather
   * than rejected: a stale bookmark or an old cached page should not stop
   * someone contacting us, and the rest of the inquiry is still worth having.
   */
  /**
   * A lead from the same company and address inside the decision window
   * (ITEM-0007), or null.
   *
   * Matching is on work e-mail **and** company, both normalised, because either
   * alone is wrong: one address can legitimately enquire for two companies, and
   * two colleagues at one company enquiring the same day is exactly the case
   * being collapsed.
   *
   * A lead that has already been worked is never absorbed. Returning an id that
   * is now `CONVERTED` — or disqualified — would silently attach a fresh
   * enquiry to a closed record and lose the new intent, which is worse than the
   * duplicate this exists to prevent.
   */
  private async findRecentDuplicateLead(dto: SubmitLeadDto, submittedAt: Date) {
    const workEmail = dto.workEmail?.trim().toLowerCase();
    const companyName = dto.companyName?.trim().toLowerCase();
    if (!workEmail || !companyName) return null;

    const windowStart = new Date(
      submittedAt.getTime() - LEAD_DUPLICATE_WINDOW_MS,
    );

    return this.prisma.lead.findFirst({
      where: {
        workEmail: { equals: workEmail, mode: 'insensitive' },
        companyName: { equals: companyName, mode: 'insensitive' },
        createdAt: { gte: windowStart },
        status: LeadStatus.NEW,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }

  private normalizeInterestAreas(interestAreas?: string[]): string[] {
    if (!interestAreas?.length) return [];

    const known = new Set<string>(
      TENANT_FEATURE_DEFINITIONS.filter((feature) => feature.isVisible).map(
        (feature) => feature.key,
      ),
    );

    return [
      ...new Set(
        interestAreas
          .map((area) => area.trim())
          .filter((area) => known.has(area)),
      ),
    ];
  }

  private async resolveReferral(referralCode?: string) {
    if (!referralCode) {
      return {
        partnerId: null,
        linkId: null,
        code: null,
        status: LeadAttributionStatus.DIRECT,
      };
    }
    const code = referralCode.trim().toUpperCase();
    const link = await this.prisma.partnerReferralLink.findUnique({
      where: { code },
      include: { partner: { select: { id: true, status: true } } },
    });
    if (!link)
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.INVALID_CODE,
      };
    if (link.partner.status !== PartnerStatus.ACTIVE)
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.INACTIVE_PARTNER,
      };
    if (link.status === PartnerReferralLinkStatus.DISABLED)
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.DISABLED_LINK,
      };
    if (
      link.status !== PartnerReferralLinkStatus.ACTIVE ||
      (link.expiresAt && link.expiresAt <= new Date())
    )
      return {
        partnerId: null,
        linkId: null,
        code,
        status: LeadAttributionStatus.EXPIRED_LINK,
      };
    return {
      partnerId: link.partner.id,
      linkId: link.id,
      code,
      status: LeadAttributionStatus.ATTRIBUTED,
    };
  }

  private async notifyLeadSubmitted(
    leadId: string,
    companyName: string,
    partnerId: string | null,
  ) {
    const recipients = await this.prisma.platformUser.findMany({
      where: {
        status: PlatformUserStatus.ACTIVE,
        role: {
          in: [
            PlatformUserRole.SUPER_ADMIN,
            PlatformUserRole.PLATFORM_OWNER,
            PlatformUserRole.PLATFORM_ADMIN,
            PlatformUserRole.PRESALES_MANAGER,
            PlatformUserRole.PARTNER_MANAGER,
          ],
        },
      },
      select: { email: true },
    });
    await Promise.all(
      recipients.map(({ email }) =>
        this.communications.sendEmail({
          eventCode: partnerId
            ? 'PARTNER_REFERRAL_LEAD_RECEIVED'
            : 'WEBSITE_LEAD_RECEIVED',
          recipient: email,
          subject: `${partnerId ? 'Partner referral' : 'Website lead'}: ${companyName}`,
          html: `<p>A new request-demo lead was received for <strong>${escapeEmailHtml(companyName)}</strong>.</p>`,
          entityType: 'Lead',
          entityId: leadId,
          idempotencyKey: `lead-submitted:${leadId}:${email}`,
          metadata: { partnerId },
        }),
      ),
    );
  }

  async listLeads(currentUser: AuthenticatedUser, query: LeadQueryDto) {
    const requestedQuery = ['my-assigned-leads', 'my-open-leads'].includes(
      query.viewKey ?? '',
    )
      ? { ...query, assignedToUserId: currentUser.platform?.id }
      : query;
    const scopedQuery =
      this.isPlatformSuperAdmin(currentUser) || !currentUser.platform?.id
        ? requestedQuery
        : { ...requestedQuery, assignedToUserId: currentUser.platform.id };
    const { items, total } = await this.leadsRepository.findMany(scopedQuery);
    const leadIds = items.map((item) => item.id);
    const customers = leadIds.length
      ? await this.prisma.customerAccount.findMany({
          where: { leadId: { in: leadIds } },
          select: { id: true, leadId: true, companyName: true, status: true },
        })
      : [];
    const customerMap = new Map(customers.map((item) => [item.leadId, item]));

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEADS_VIEWED',
      entityType: 'Lead',
      entityId: 'list',
      afterSnapshot: {
        page: scopedQuery.page,
        pageSize: scopedQuery.pageSize,
        total,
        ownerScope: scopedQuery.assignedToUserId ?? 'all',
      },
    });

    return {
      items: items.map((item) => ({
        ...item,
        assignedToUser: item.assignedToUser
          ? {
              ...item.assignedToUser,
              fullName: `${item.assignedToUser.firstName} ${item.assignedToUser.lastName}`,
            }
          : null,
        convertedCustomer: customerMap.get(item.id) ?? null,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: {
        status: query.status ?? null,
        subStatus: query.subStatus ?? null,
        industry: query.industry ?? null,
        assignedToUserId: scopedQuery.assignedToUserId ?? null,
        source: query.source ?? null,
        search: query.search?.trim() ?? null,
        sortField: query.sortField ?? 'createdAt',
        sortDirection: query.sortDirection ?? 'desc',
      },
    };
  }

  async getLead(currentUser: AuthenticatedUser, leadId: string) {
    const lead = await this.leadsRepository.findById(leadId);
    if (!lead) {
      throw new NotFoundException('Lead not found.');
    }
    this.assertLeadOwnerAccess(currentUser, lead);

    const [convertedCustomer, contracts] = await Promise.all([
      this.prisma.customerAccount.findFirst({
        where: { leadId },
        select: { id: true, companyName: true, status: true, subStatus: true },
      }),
      this.prisma.contract.findMany({
        where: { relatedLeadId: leadId },
        select: {
          id: true,
          contractNumber: true,
          title: true,
          contractType: true,
          status: true,
          signedAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEAD_VIEWED',
      entityType: 'Lead',
      entityId: leadId,
    });

    return { ...lead, convertedCustomer, contracts };
  }

  async createLead(currentUser: AuthenticatedUser, dto: CreateAdminLeadDto) {
    this.assertLeadSubStatus(dto.status ?? LeadStatus.NEW, dto.subStatus);
    this.assertLeadSource(dto.source);
    const creatorAssigneeId =
      await this.resolveCreatorLeadAssignee(currentUser);
    const assignedToUserId =
      dto.assignedToUserId === undefined || dto.assignedToUserId === null
        ? creatorAssigneeId
        : await this.resolveLeadAssignee(dto.assignedToUserId);

    const lead = await this.leadsRepository.create({
      contactFirstName: dto.contactFirstName.trim(),
      contactLastName: dto.contactLastName.trim(),
      fullName:
        `${dto.contactFirstName.trim()} ${dto.contactLastName.trim()}`.trim(),
      companyName: dto.companyName.trim(),
      workEmail: dto.workEmail,
      phoneNumber: dto.phoneNumber ?? null,
      companyWebsite: dto.companyWebsite ?? null,
      industry: dto.industry.trim(),
      companySize: dto.companySize.trim(),
      country: dto.country ?? null,
      stateProvince: dto.stateProvince ?? null,
      city: dto.city ?? null,
      source: normalizeLeadSource(dto.source) ?? 'Manual Entry',
      interestedPlan: dto.interestedPlan ?? null,
      estimatedEmployeeCount: dto.estimatedEmployeeCount ?? null,
      expectedGoLiveDate: dto.expectedGoLiveDate
        ? new Date(dto.expectedGoLiveDate)
        : null,
      budgetExpectation: dto.budgetExpectation ?? null,
      requirementsSummary: dto.requirementsSummary ?? null,
      notes: dto.notes ?? null,
      assignedToUserId,
      partnerId: dto.partnerId ?? null,
      status: dto.status ?? LeadStatus.NEW,
      subStatus: dto.subStatus ?? null,
      isQualified:
        dto.isQualified ?? (dto.status === LeadStatus.QUALIFIED ? true : false),
      ...definedOnly(leadContractingData(dto)),
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEAD_CREATED',
      entityType: 'Lead',
      entityId: lead.id,
      afterSnapshot: lead,
    });

    return lead;
  }

  async updateLead(
    currentUser: AuthenticatedUser,
    leadId: string,
    dto: UpdateAdminLeadDto,
  ) {
    const existing = await this.leadsRepository.findById(leadId);
    if (!existing) {
      throw new NotFoundException('Lead not found.');
    }
    this.assertLeadOwnerAccess(currentUser, existing);

    if (dto.partnerId !== undefined && dto.partnerId !== existing.partnerId) {
      throw new BadRequestException(
        'Use the audited attribution-correction action to change a lead partner.',
      );
    }

    const terminalLeadStatuses: LeadStatus[] = [
      LeadStatus.CONVERTED,
      LeadStatus.ARCHIVED,
    ];
    if (terminalLeadStatuses.includes(existing.status)) {
      throw new BadRequestException(
        'Completed leads are read-only and cannot be edited.',
      );
    }

    const nextStatus = dto.status ?? existing.status;
    const statusChanged =
      dto.status !== undefined && dto.status !== existing.status;
    const nextSubStatus =
      dto.subStatus !== undefined
        ? dto.subStatus
        : statusChanged
          ? getDefaultSubStatus('lead', nextStatus)
          : existing.subStatus;
    this.assertLeadSubStatus(nextStatus, nextSubStatus);
    this.assertLeadSource(dto.source);
    const assignedToUserId =
      dto.assignedToUserId === undefined
        ? undefined
        : await this.resolveLeadAssignee(dto.assignedToUserId);
    if (statusChanged) {
      this.assertLeadTransition(existing.status, nextStatus);
      this.assertRequiredCriteriaForLead(nextStatus, {
        ...existing,
        ...dto,
      });
      if (nextStatus === LeadStatus.CONVERTED)
        await this.assertGoverningAgreementExecuted(leadId);
    }

    const updated = await this.leadsRepository.update(leadId, {
      ...(dto.contactFirstName !== undefined
        ? { contactFirstName: dto.contactFirstName.trim() }
        : {}),
      ...(dto.contactLastName !== undefined
        ? { contactLastName: dto.contactLastName.trim() }
        : {}),
      ...(dto.contactFirstName !== undefined ||
      dto.contactLastName !== undefined
        ? {
            fullName:
              `${dto.contactFirstName ?? existing.contactFirstName ?? ''} ${
                dto.contactLastName ?? existing.contactLastName ?? ''
              }`.trim(),
          }
        : {}),
      ...(dto.companyName !== undefined
        ? { companyName: dto.companyName.trim() }
        : {}),
      ...(dto.workEmail !== undefined ? { workEmail: dto.workEmail } : {}),
      ...(dto.phoneNumber !== undefined
        ? { phoneNumber: dto.phoneNumber ?? null }
        : {}),
      ...(dto.companyWebsite !== undefined
        ? { companyWebsite: dto.companyWebsite ?? null }
        : {}),
      ...(dto.industry !== undefined ? { industry: dto.industry.trim() } : {}),
      ...(dto.companySize !== undefined
        ? { companySize: dto.companySize.trim() }
        : {}),
      ...(dto.country !== undefined ? { country: dto.country ?? null } : {}),
      ...(dto.stateProvince !== undefined
        ? { stateProvince: dto.stateProvince ?? null }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city ?? null } : {}),
      ...(dto.source !== undefined
        ? { source: normalizeLeadSource(dto.source) ?? existing.source }
        : {}),
      ...(dto.interestedPlan !== undefined
        ? { interestedPlan: dto.interestedPlan ?? null }
        : {}),
      ...(dto.estimatedEmployeeCount !== undefined
        ? { estimatedEmployeeCount: dto.estimatedEmployeeCount ?? null }
        : {}),
      ...(dto.expectedGoLiveDate !== undefined
        ? {
            expectedGoLiveDate: dto.expectedGoLiveDate
              ? new Date(dto.expectedGoLiveDate)
              : null,
          }
        : {}),
      ...(dto.budgetExpectation !== undefined
        ? { budgetExpectation: dto.budgetExpectation ?? null }
        : {}),
      ...(dto.requirementsSummary !== undefined
        ? { requirementsSummary: dto.requirementsSummary ?? null }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
      ...(dto.assignedToUserId !== undefined ? { assignedToUserId } : {}),
      ...(dto.partnerId !== undefined
        ? { partnerId: dto.partnerId ?? null }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.subStatus !== undefined || statusChanged
        ? { subStatus: nextSubStatus ?? null }
        : {}),
      ...(dto.isQualified !== undefined
        ? { isQualified: dto.isQualified }
        : {}),
      ...(nextStatus === LeadStatus.CONVERTED
        ? { convertedAt: new Date() }
        : {}),
      ...definedOnly(leadContractingData(dto)),
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEAD_UPDATED',
      entityType: 'Lead',
      entityId: leadId,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.events.record({
        eventCode:
          dto.status === LeadStatus.QUALIFIED
            ? 'LEAD_QUALIFIED'
            : 'LEAD_STATUS_CHANGED',
        source: 'ADMIN',
        entityType: 'Lead',
        entityId: leadId,
        actorType: 'PLATFORM_USER',
        actorId: currentUser.userId,
        route: `/leads/${leadId}`,
        metadata: { fromStatus: existing.status, toStatus: dto.status },
      });
    }

    return updated;
  }

  async bulkDeleteLeads(currentUser: AuthenticatedUser, ids: string[]) {
    await this.assertBulkLeadOwnerAccess(currentUser, ids);
    const customers = await this.prisma.customerAccount.findMany({
      where: { leadId: { in: ids } },
      select: { leadId: true },
    });
    const protectedLeadIds = new Set(customers.map((item) => item.leadId));
    if (protectedLeadIds.size > 0) {
      throw new BadRequestException(
        'Converted leads cannot be deleted in bulk.',
      );
    }

    const result = await this.leadsRepository.deleteMany(ids);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEADS_DELETED',
      entityType: 'Lead',
      entityId: 'bulk',
      afterSnapshot: { ids, count: result.count },
    });

    return { deletedCount: result.count };
  }

  async correctAttribution(
    currentUser: AuthenticatedUser,
    leadId: string,
    dto: CorrectLeadAttributionDto,
  ) {
    if (
      !new Set<PlatformUserRole>([
        PlatformUserRole.SUPER_ADMIN,
        PlatformUserRole.PLATFORM_OWNER,
        PlatformUserRole.PLATFORM_ADMIN,
      ]).has(currentUser.platform?.role as PlatformUserRole)
    ) {
      throw new ForbiddenException(
        'Only an authorized Platform Admin may correct lead attribution.',
      );
    }
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found.');
    if (!dto.reason?.trim())
      throw new BadRequestException('A correction reason is required.');
    const link = dto.referralLinkId
      ? await this.prisma.partnerReferralLink.findUnique({
          where: { id: dto.referralLinkId },
        })
      : null;
    const partnerId = dto.partnerId ?? link?.partnerId ?? null;
    if (link && partnerId !== link.partnerId)
      throw new BadRequestException(
        'Referral link does not belong to the selected partner.',
      );
    if (
      partnerId &&
      !(await this.prisma.partner.findUnique({
        where: { id: partnerId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Selected partner does not exist.');

    await this.prisma.$transaction(async (tx) => {
      await tx.leadAttributionCorrection.create({
        data: {
          leadId,
          previousPartnerId: lead.partnerId,
          correctedPartnerId: partnerId,
          previousReferralLinkId: lead.partnerReferralLinkId,
          correctedReferralLinkId: link?.id ?? null,
          previousReferralCode: lead.referralCodeSnapshot,
          correctedReferralCode: link?.code ?? null,
          reason: dto.reason.trim(),
          changedById: currentUser.userId,
        },
      });
      await tx.lead.update({
        where: { id: leadId },
        data: {
          partnerId,
          partnerReferralLinkId: link?.id ?? null,
          referralCodeSnapshot: link?.code ?? null,
          attributionStatus: 'CORRECTED',
        },
      });
      await tx.customerAccount.updateMany({
        where: { leadId },
        data: {
          originatingPartnerId: partnerId,
          originatingReferralLinkId: link?.id ?? null,
          referralCodeSnapshot: link?.code ?? null,
        },
      });
      if (partnerId) {
        await tx.partnerTimeline.create({
          data: {
            partnerId,
            eventType: 'LEAD_ATTRIBUTION_CORRECTED',
            actorType: 'PLATFORM_USER',
            actorId: currentUser.userId,
            message: `Lead attribution corrected for ${lead.companyName}.`,
            metadata: {
              leadId,
              reason: dto.reason.trim(),
              previousPartnerId: lead.partnerId,
            },
          },
        });
      }
    });
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEAD_ATTRIBUTION_CORRECTED',
      entityType: 'Lead',
      entityId: leadId,
      beforeSnapshot: {
        partnerId: lead.partnerId,
        referralLinkId: lead.partnerReferralLinkId,
      },
      afterSnapshot: {
        partnerId,
        referralLinkId: link?.id ?? null,
        reason: dto.reason.trim(),
      },
    });
    return this.getLead(currentUser, leadId);
  }

  async bulkAssignLeads(
    currentUser: AuthenticatedUser,
    dto: BulkAssignLeadsDto,
  ) {
    if (!this.isPlatformSuperAdmin(currentUser)) {
      throw new BadRequestException(
        'Only Platform Super Admin can reassign leads.',
      );
    }
    const assignedToUserId = await this.resolveLeadAssignee(
      dto.assignedToUserId,
    );
    const updated = await this.prisma.lead.updateMany({
      where: { id: { in: dto.ids } },
      data: {
        assignedToUserId,
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEADS_ASSIGNED',
      entityType: 'Lead',
      entityId: 'bulk',
      afterSnapshot: {
        ids: dto.ids,
        assignedToUserId,
        count: updated.count,
      },
    });

    return { updatedCount: updated.count };
  }

  private assertLeadSubStatus(status: LeadStatus, subStatus?: string | null) {
    if (!isValidSubStatus('lead', status, subStatus)) {
      const allowedSubStatuses = getSubStatusOptions('lead', status).map(
        (option) => option.value,
      );
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Lead sub-status is not valid for the selected lead status.',
        description:
          'Select a sub-status that belongs to the selected lead status.',
        details: {
          fieldErrors: [
            {
              field: 'subStatus',
              message: `Select one of: ${allowedSubStatuses.join(', ')}.`,
            },
          ],
          selectedStatus: status,
          submittedSubStatus: subStatus ?? null,
          allowedSubStatuses,
        },
      });
    }
  }

  private assertLeadSource(source?: string | null) {
    if (!isValidLeadSource(source)) {
      throw new BadRequestException('Lead source is not supported.');
    }
  }

  private assertLeadOwnerAccess(
    currentUser: AuthenticatedUser,
    lead: { assignedToUserId?: string | null },
  ) {
    if (this.isPlatformSuperAdmin(currentUser)) return;
    if (
      lead.assignedToUserId &&
      lead.assignedToUserId === currentUser.platform?.id
    ) {
      return;
    }
    throw new NotFoundException('Lead not found.');
  }

  private async assertBulkLeadOwnerAccess(
    currentUser: AuthenticatedUser,
    ids: string[],
  ) {
    if (this.isPlatformSuperAdmin(currentUser)) return;
    const ownedCount = await this.prisma.lead.count({
      where: {
        id: { in: ids },
        assignedToUserId: currentUser.platform?.id ?? '__none__',
      },
    });
    if (ownedCount !== ids.length) {
      throw new BadRequestException(
        'Members can only bulk modify leads they own.',
      );
    }
  }

  private isPlatformSuperAdmin(currentUser: AuthenticatedUser) {
    return new Set<PlatformUserRole>([
      PlatformUserRole.SUPER_ADMIN,
      PlatformUserRole.PLATFORM_OWNER,
      PlatformUserRole.PLATFORM_ADMIN,
      PlatformUserRole.PRESALES_MANAGER,
    ]).has(currentUser.platform?.role as PlatformUserRole);
  }

  private async resolveLeadAssignee(assignedToUserId?: string | null) {
    if (!assignedToUserId) return null;

    const user = await this.prisma.platformUser.findFirst({
      where: {
        id: assignedToUserId,
        status: PlatformUserStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        'Lead owner must be an active platform system user.',
      );
    }

    return user.id;
  }

  private async resolveCreatorLeadAssignee(currentUser: AuthenticatedUser) {
    const platformUserId = currentUser.platform?.id ?? currentUser.userId;
    const user = await this.prisma.platformUser.findFirst({
      where: {
        id: platformUserId,
        status: PlatformUserStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        'Lead creator must be an active platform system user before owning leads.',
      );
    }

    return user.id;
  }

  private assertLeadTransition(
    currentStatus: LeadStatus,
    nextStatus: LeadStatus,
  ) {
    if (!isValidTransition('lead', currentStatus, nextStatus)) {
      const currentStage = getEntityStageDefinition('lead', currentStatus);
      const message = currentStage?.isTerminal
        ? 'Terminal lead statuses cannot transition further.'
        : 'Lead status transition is not allowed by lifecycle rules.';
      throw new BadRequestException(message);
    }
  }

  /*
   * The authoritative Contract record decides whether the lead may convert, not
   * a flag on the lead. Records the refusal so a blocked conversion is visible
   * in the lead's own event history.
   */
  private async assertGoverningAgreementExecuted(leadId: string) {
    const executed = await this.prisma.contract.findFirst({
      where: executedGoverningAgreementWhere(leadAgreementScope(leadId)),
      select: { id: true },
    });
    if (executed) return;

    await this.events.record({
      eventCode: 'LEAD_CONVERSION_BLOCKED',
      source: 'ADMIN',
      entityType: 'Lead',
      entityId: leadId,
      actorType: 'PLATFORM_USER',
      route: '/leads',
      result: 'FAILED',
      metadata: { reason: 'GOVERNING_AGREEMENT_NOT_EXECUTED' },
    });
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: GOVERNING_AGREEMENT_REQUIRED_MESSAGE,
      details: {
        fieldErrors: [
          {
            field: 'status',
            message: GOVERNING_AGREEMENT_REQUIRED_MESSAGE,
          },
        ],
      },
    });
  }

  private assertRequiredCriteriaForLead(
    status: LeadStatus,
    record: Record<string, unknown>,
  ) {
    const missing = getRequiredCriteria('lead', status)
      .filter((criterion) => criterion.fieldKey)
      .filter(
        (criterion) => !isCompleteCriterionValue(record[criterion.fieldKey!]),
      )
      .map((criterion) => criterion.label);

    if (missing.length > 0) {
      throw new BadRequestException(
        `Complete required criteria before moving status: ${missing.join(', ')}.`,
      );
    }
  }
}

function isCompleteCriterionValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function escapeEmailHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/*
 * Contracting fields map identically on create and update, so the shape is
 * built once. `undefined` keys are dropped by the caller on update so an
 * untouched field is never cleared.
 */
function leadContractingData(dto: LeadContractingTermsDto) {
  return {
    legalCompanyName: dto.legalCompanyName,
    registrationNumber: dto.registrationNumber,
    registeredAddress: dto.registeredAddress,
    countryOfRegistration: dto.countryOfRegistration,
    taxId: dto.taxId,
    authorizedSignerName: dto.authorizedSignerName,
    authorizedSignerTitle: dto.authorizedSignerTitle,
    authorizedSignerEmail: dto.authorizedSignerEmail,
    billingContactName: dto.billingContactName,
    billingContactEmail: dto.billingContactEmail,
    agreedPlanId: dto.agreedPlanId,
    agreedSeats: dto.agreedSeats,
    agreedPrice: dto.agreedPrice,
    billingCycle: dto.billingCycle,
    subscriptionTerm: dto.subscriptionTerm,
    paymentTerms: dto.paymentTerms,
    proposedEffectiveDate: dto.proposedEffectiveDate
      ? new Date(dto.proposedEffectiveDate)
      : dto.proposedEffectiveDate,
  };
}

function definedOnly<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * A short human label for the inquiry, used as the Lead sub-status so Sales can
 * see the topic in a list without opening the record.
 *
 * Returns null when no intent was given, rather than a placeholder. The previous
 * code hardcoded 'Demo requested' on every lead, which made the column
 * worthless: it said the same thing whether or not anyone wanted a demo.
 */
function describeIntent(intent?: LeadInquiryIntent | null): string | null {
  if (!intent) return null;
  return (
    LEAD_INQUIRY_INTENT_OPTIONS.find((option) => option.value === intent)
      ?.label ?? null
  );
}

/**
 * Identify a *transport* duplicate — the same submission arriving twice.
 *
 * The hash covers who submitted, what they asked, and the hour they asked it.
 * That distinguishes the two cases the requirement calls out: a double click or
 * a retry lands in the same hour with identical content and is absorbed, while
 * the same person asking about payroll six months after asking about pricing
 * hashes differently and is correctly a new inquiry.
 *
 * An hour bucket rather than a rolling window because it needs no extra state
 * and no cleanup job. The cost is that two genuinely distinct but identical
 * submissions inside one hour collapse — which is the safer error.
 */
function buildSubmissionHash(dto: SubmitLeadDto, submittedAt: Date): string {
  const hourBucket = new Date(submittedAt).toISOString().slice(0, 13);

  const parts = [
    dto.workEmail?.trim().toLowerCase() ?? '',
    dto.companyName?.trim().toLowerCase() ?? '',
    dto.inquiryIntent ?? '',
    (dto.message ?? '').trim().toLowerCase(),
    hourBucket,
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}
