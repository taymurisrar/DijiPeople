import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeadQueryDto } from './dto/admin-lead.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;
type LeadListItem = Prisma.LeadGetPayload<{
  include: {
    assignedToUser: {
      select: { id: true; firstName: true; lastName: true; email: true };
    };
    partner: { select: { id: true; code: true; displayName: true } };
  };
}>;

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.LeadUncheckedCreateInput, db: PrismaDb = this.prisma) {
    return db.lead.create({ data });
  }

  findById(id: string, db: PrismaDb = this.prisma) {
    return db.lead.findUnique({ where: { id } });
  }

  update(
    id: string,
    data: Prisma.LeadUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.lead.update({ where: { id }, data });
  }

  async findMany(query: LeadQueryDto, db: PrismaDb = this.prisma) {
    const where: Prisma.LeadWhereInput = leadViewWhere(query.viewKey);
    if (query.status) {
      where.status = query.status;
    }

    if (query.subStatus) {
      where.subStatus = query.subStatus;
    }

    if (query.industry) {
      where.industry = query.industry;
    }

    if (query.source) {
      where.source = query.source;
    }

    if (query.assignedToUserId) {
      where.assignedToUserId = query.assignedToUserId;
    }

    if (query.partnerId) {
      where.partnerId = query.partnerId;
    }

    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo
          ? {
              lte: new Date(
                new Date(query.createdTo).getTime() + 24 * 60 * 60 * 1000 - 1,
              ),
            }
          : {}),
      };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { contactFirstName: { contains: search, mode: 'insensitive' } },
        { contactLastName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { workEmail: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const requestedSort = query.sortField?.trim() ?? 'createdAt';
    const requestedDirection =
      query.sortDirection?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.LeadOrderByWithRelationInput[] =
      requestedSort === 'createdAt'
        ? [{ createdAt: requestedDirection }]
        : requestedSort === 'companyName'
          ? [{ companyName: requestedDirection }, { createdAt: 'desc' }]
          : requestedSort === 'owner'
            ? [{ assignedToUserId: requestedDirection }, { createdAt: 'desc' }]
            : requestedSort === 'status'
              ? [{ status: requestedDirection }, { createdAt: 'desc' }]
              : [{ createdAt: 'desc' }];
    const [items, total] = (await Promise.all([
      db.lead.findMany({
        where,
        include: {
          assignedToUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          partner: { select: { id: true, code: true, displayName: true } },
        },
        orderBy,
        skip,
        take: query.pageSize,
      }),
      db.lead.count({ where }),
    ])) as [LeadListItem[], number];

    return { items, total };
  }

  deleteMany(ids: string[], db: PrismaDb = this.prisma) {
    return db.lead.deleteMany({ where: { id: { in: ids } } });
  }
}

function leadViewWhere(viewKey?: string): Prisma.LeadWhereInput {
  const statuses: Record<string, LeadStatus> = {
    new: 'NEW',
    contacted: 'CONTACTED',
    qualified: 'QUALIFIED',
    unqualified: 'UNQUALIFIED',
    converted: 'CONVERTED',
    'closed-lost': 'CLOSED_LOST',
  };
  if (viewKey && statuses[viewKey]) return { status: statuses[viewKey] };
  if (viewKey === 'direct-leads') return { partnerId: null };
  if (viewKey === 'partner-referred-leads') return { partnerId: { not: null } };
  if (viewKey === 'website-leads') return { source: 'Website' };
  if (viewKey === 'partner-leads') return { partnerId: { not: null } };
  if (viewKey === 'my-open-leads')
    return {
      status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] },
    };
  if (viewKey === 'awaiting-agreement')
    return {
      status: 'QUALIFIED',
      contracts: {
        none: { status: { in: ['FULLY_SIGNED', 'FULLY_EXECUTED', 'ACTIVE'] } },
      },
    };
  if (viewKey === 'lost-inactive')
    return { status: { in: ['UNQUALIFIED', 'CLOSED_LOST', 'ARCHIVED'] } };
  if (viewKey === 'unassigned-leads') return { assignedToUserId: null };
  return {};
}
