import { Injectable } from '@nestjs/common';
import { DocumentEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentQueryDto } from './dto/document-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

export const documentInclude = {
  documentType: {
    select: {
      id: true,
      key: true,
      name: true,
    },
  },
  documentCategory: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  uploadedByUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  links: {
    select: {
      id: true,
      entityType: true,
      entityId: true,
      employeeId: true,
      candidateId: true,
      leaveRequestId: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.DocumentInclude;

export type DocumentWithRelations = Prisma.DocumentGetPayload<{
  include: typeof documentInclude;
}>;

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(
    tenantId: string,
    query: DocumentQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.DocumentWhereInput = {
      tenantId,
      isArchived: false,
    };

    if (query.documentTypeId) {
      where.documentTypeId = query.documentTypeId;
    }

    if (query.documentCategoryId) {
      where.documentCategoryId = query.documentCategoryId;
    }

    if (query.uploadedByUserId) {
      where.uploadedByUserId = query.uploadedByUserId;
    }

    if (query.title?.trim()) {
      where.OR = [
        { title: { contains: query.title.trim(), mode: 'insensitive' } },
        {
          originalFileName: {
            contains: query.title.trim(),
            mode: 'insensitive',
          },
        },
      ];
    }

    if (query.uploadedFrom || query.uploadedTo) {
      where.createdAt = {
        ...(query.uploadedFrom ? { gte: new Date(query.uploadedFrom) } : {}),
        ...(query.uploadedTo ? { lte: new Date(query.uploadedTo) } : {}),
      };
    }

    if (query.entityType || query.entityId) {
      where.links = {
        some: {
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.entityId ? { entityId: query.entityId } : {}),
        },
      };
    }

    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.document.findMany({
        where,
        include: documentInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.document.count({ where }),
    ]);

    return { items, total };
  }

  findById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.document.findFirst({
      where: { tenantId, id, isArchived: false },
      include: documentInclude,
    });
  }

  findByEntity(
    tenantId: string,
    entityType: DocumentEntityType,
    entityId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.document.findMany({
      where: {
        tenantId,
        isArchived: false,
        links: {
          some: {
            entityType,
            entityId,
          },
        },
      },
      include: documentInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  createDocument(
    data: Prisma.DocumentUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.document.create({
      data,
      include: documentInclude,
    });
  }

  updateDocument(
    tenantId: string,
    id: string,
    data: Prisma.DocumentUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.document.updateMany({
      where: { tenantId, id, isArchived: false },
      data,
    });
  }

  archiveDocument(
    tenantId: string,
    id: string,
    actorUserId?: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.document.updateMany({
      where: { tenantId, id, isArchived: false },
      data: {
        isArchived: true,
        updatedById: actorUserId,
      },
    });
  }

  createLink(
    data: Prisma.DocumentLinkUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.documentLink.create({ data });
  }

  listDocumentTypes(tenantId: string, db: PrismaDb = this.prisma) {
    return db.documentType.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  listDocumentCategories(tenantId: string, db: PrismaDb = this.prisma) {
    return db.documentCategory.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}
