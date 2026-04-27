import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  BulkAssignLeadsDto,
  CreateAdminLeadDto,
  LeadQueryDto,
  UpdateAdminLeadDto,
} from './dto/admin-lead.dto';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { LeadsRepository } from './leads.repository';
import { isValidSubStatus } from '../super-admin/platform-lifecycle.constants';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LeadsService {
  constructor(
    private readonly leadsRepository: LeadsRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async submitLead(dto: SubmitLeadDto) {
    if (dto.website?.trim()) {
      return { submitted: true };
    }

    const lead = await this.leadsRepository.create({
      contactFirstName: dto.firstName.trim(),
      contactLastName: dto.lastName.trim(),
      fullName: `${dto.firstName.trim()} ${dto.lastName.trim()}`.trim(),
      companyName: dto.companyName,
      workEmail: dto.workEmail,
      phoneNumber: dto.phoneNumber ?? null,
      industry: dto.industry,
      companySize: dto.companySize,
      requirementsSummary: dto.message ?? null,
      message: dto.message ?? null,
      interestedPlan: dto.interestedPlan ?? null,
      source: 'landing_page',
      status: LeadStatus.NEW,
      subStatus: 'Demo requested',
    });

    return {
      submitted: true,
      id: lead.id,
    };
  }

  async listLeads(currentUser: AuthenticatedUser, query: LeadQueryDto) {
    const { items, total } = await this.leadsRepository.findMany(query);
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
      afterSnapshot: { page: query.page, pageSize: query.pageSize, total },
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
        assignedToUserId: query.assignedToUserId ?? null,
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

    const lead = await this.leadsRepository.create({
      contactFirstName: dto.contactFirstName.trim(),
      contactLastName: dto.contactLastName.trim(),
      fullName: `${dto.contactFirstName.trim()} ${dto.contactLastName.trim()}`.trim(),
      companyName: dto.companyName.trim(),
      workEmail: dto.workEmail,
      phoneNumber: dto.phoneNumber ?? null,
      companyWebsite: dto.companyWebsite ?? null,
      industry: dto.industry.trim(),
      companySize: dto.companySize.trim(),
      country: dto.country ?? null,
      stateProvince: dto.stateProvince ?? null,
      city: dto.city ?? null,
      source: dto.source ?? 'manual_admin',
      interestedPlan: dto.interestedPlan ?? null,
      estimatedEmployeeCount: dto.estimatedEmployeeCount ?? null,
      expectedGoLiveDate: dto.expectedGoLiveDate
        ? new Date(dto.expectedGoLiveDate)
        : null,
      budgetExpectation: dto.budgetExpectation ?? null,
      requirementsSummary: dto.requirementsSummary ?? null,
      notes: dto.notes ?? null,
      assignedToUserId: dto.assignedToUserId ?? currentUser.userId,
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

    const nextStatus = dto.status ?? existing.status;
    const nextSubStatus =
      dto.subStatus === undefined ? existing.subStatus : dto.subStatus;
    this.assertLeadSubStatus(nextStatus, nextSubStatus);

    const updated = await this.leadsRepository.update(leadId, {
      ...(dto.contactFirstName !== undefined
        ? { contactFirstName: dto.contactFirstName.trim() }
        : {}),
      ...(dto.contactLastName !== undefined
        ? { contactLastName: dto.contactLastName.trim() }
        : {}),
      ...(dto.contactFirstName !== undefined || dto.contactLastName !== undefined
        ? {
            fullName: `${dto.contactFirstName ?? existing.contactFirstName ?? ''} ${
              dto.contactLastName ?? existing.contactLastName ?? ''
            }`.trim(),
          }
        : {}),
      ...(dto.companyName !== undefined ? { companyName: dto.companyName.trim() } : {}),
      ...(dto.workEmail !== undefined ? { workEmail: dto.workEmail } : {}),
      ...(dto.phoneNumber !== undefined ? { phoneNumber: dto.phoneNumber ?? null } : {}),
      ...(dto.companyWebsite !== undefined
        ? { companyWebsite: dto.companyWebsite ?? null }
        : {}),
      ...(dto.industry !== undefined ? { industry: dto.industry.trim() } : {}),
      ...(dto.companySize !== undefined ? { companySize: dto.companySize.trim() } : {}),
      ...(dto.country !== undefined ? { country: dto.country ?? null } : {}),
      ...(dto.stateProvince !== undefined
        ? { stateProvince: dto.stateProvince ?? null }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city ?? null } : {}),
      ...(dto.source !== undefined ? { source: dto.source.trim() } : {}),
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
      ...(dto.assignedToUserId !== undefined
        ? { assignedToUserId: dto.assignedToUserId ?? null }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.subStatus !== undefined ? { subStatus: dto.subStatus ?? null } : {}),
      ...(dto.isQualified !== undefined ? { isQualified: dto.isQualified } : {}),
      ...(nextStatus === LeadStatus.CONVERTED ? { convertedAt: new Date() } : {}),
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

  async bulkAssignLeads(
    currentUser: AuthenticatedUser,
    dto: BulkAssignLeadsDto,
  ) {
    const updated = await this.prisma.lead.updateMany({
      where: { id: { in: dto.ids } },
      data: {
        assignedToUserId: dto.assignedToUserId ?? null,
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
        assignedToUserId: dto.assignedToUserId ?? null,
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
}
