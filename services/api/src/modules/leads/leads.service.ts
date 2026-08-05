import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeadAttributionStatus,
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
  LeadQueryDto,
  UpdateAdminLeadDto,
} from './dto/admin-lead.dto';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { LeadsRepository } from './leads.repository';
import {
  getEntityStageDefinition,
  getRequiredCriteria,
  isValidLeadSource,
  isValidSubStatus,
  isValidTransition,
  normalizeLeadSource,
} from '../super-admin/platform-lifecycle.constants';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformCommunicationsService } from '../platform-communications/platform-communications.service';

@Injectable()
export class LeadsService {
  constructor(
    private readonly leadsRepository: LeadsRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly communications: PlatformCommunicationsService,
  ) {}

  async submitLead(dto: SubmitLeadDto) {
    if (dto.website?.trim()) {
      return { submitted: true };
    }

    const referral = await this.resolveReferral(dto.referralCode);
    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await this.leadsRepository.create(
        {
          contactFirstName: dto.firstName.trim(),
          contactLastName: dto.lastName.trim(),
          fullName: `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim(),
          companyName: dto.companyName,
          workEmail: dto.workEmail,
          phoneNumber: dto.phoneNumber ?? null,
          industry: dto.industry,
          companySize: dto.companySize,
          country: dto.country ?? null,
          requirementsSummary: dto.message ?? null,
          message: dto.message ?? null,
          interestedPlan: dto.interestArea ?? dto.interestedPlan ?? null,
          source: referral.partnerId ? 'Partner Referral' : 'Website',
          status: LeadStatus.NEW,
          subStatus: 'Demo requested',
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
      return created;
    });

    await this.notifyLeadSubmitted(
      lead.id,
      lead.companyName,
      referral.partnerId,
    );

    return {
      submitted: true,
      id: lead.id,
    };
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
    const requestedQuery =
      query.viewKey === 'my-assigned-leads'
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

    const convertedCustomer = await this.prisma.customerAccount.findFirst({
      where: { leadId },
      select: { id: true, companyName: true, status: true, subStatus: true },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PLATFORM_LEAD_VIEWED',
      entityType: 'Lead',
      entityId: leadId,
    });

    return { ...lead, convertedCustomer };
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
    const nextSubStatus =
      dto.subStatus === undefined ? existing.subStatus : dto.subStatus;
    this.assertLeadSubStatus(nextStatus, nextSubStatus);
    this.assertLeadSource(dto.source);
    const assignedToUserId =
      dto.assignedToUserId === undefined
        ? undefined
        : await this.resolveLeadAssignee(dto.assignedToUserId);
    if (dto.status !== undefined && dto.status !== existing.status) {
      this.assertLeadTransition(existing.status, dto.status);
      this.assertRequiredCriteriaForLead(nextStatus, {
        ...existing,
        ...dto,
      });
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
      ...(dto.subStatus !== undefined
        ? { subStatus: dto.subStatus ?? null }
        : {}),
      ...(dto.isQualified !== undefined
        ? { isQualified: dto.isQualified }
        : {}),
      ...(nextStatus === LeadStatus.CONVERTED
        ? { convertedAt: new Date() }
        : {}),
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
      throw new BadRequestException(
        'Lead sub-status is not valid for the selected lead status.',
      );
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
