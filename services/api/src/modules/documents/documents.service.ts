import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentEntityType, Prisma } from '@prisma/client';
import { extname } from 'path';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import {
  DocumentsRepository,
  DocumentWithRelations,
} from './documents.repository';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly auditService: AuditService,
  ) {}

  async findByTenant(tenantId: string, query: DocumentQueryDto) {
    const { items, total } = await this.documentsRepository.findByTenant(
      tenantId,
      query,
    );

    return {
      items: items.map((item) => this.mapDocument(item)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: {
        documentTypeId: query.documentTypeId ?? null,
        documentCategoryId: query.documentCategoryId ?? null,
        title: query.title ?? null,
        uploadedByUserId: query.uploadedByUserId ?? null,
        entityType: query.entityType ?? null,
        entityId: query.entityId ?? null,
        uploadedFrom: query.uploadedFrom ?? null,
        uploadedTo: query.uploadedTo ?? null,
      },
    };
  }

  async findByEntity(
    tenantId: string,
    entityType: DocumentEntityType,
    entityId: string,
  ) {
    await this.assertValidLinkedEntity(tenantId, entityType, entityId);
    const items = await this.documentsRepository.findByEntity(
      tenantId,
      entityType,
      entityId,
    );
    return items.map((item) => this.mapDocument(item));
  }

  async findById(tenantId: string, documentId: string) {
    const document = await this.documentsRepository.findById(
      tenantId,
      documentId,
    );

    if (!document || document.isArchived) {
      throw new NotFoundException('Document was not found for this tenant.');
    }

    return this.mapDocument(document);
  }

  async upload(
    currentUser: AuthenticatedUser,
    dto: UploadDocumentDto,
    file: UploadedFile | undefined,
  ) {
    const documentSettings =
      await this.tenantSettingsResolverService.getDocumentSettings(
        currentUser.tenantId,
      );
    const validatedFile = this.validateUploadedFile(file, documentSettings);
    const [documentType, documentCategory] = await Promise.all([
      this.validateDocumentType(currentUser.tenantId, dto.documentTypeId),
      this.validateDocumentCategory(
        currentUser.tenantId,
        dto.documentCategoryId,
      ),
    ]);

    if (
      documentSettings.requireDocumentCategories &&
      dto.entityType !== DocumentEntityType.TENANT &&
      !dto.documentCategoryId
    ) {
      throw new BadRequestException(
        'Document category is required by tenant document settings.',
      );
    }

    if (documentSettings.requireDescription && !dto.description?.trim()) {
      throw new BadRequestException(
        'Document description is required by tenant document settings.',
      );
    }

    await this.assertValidLinkedEntity(
      currentUser.tenantId,
      dto.entityType,
      dto.entityId,
    );

    if (
      documentType?.allowedMimeTypes &&
      Array.isArray(documentType.allowedMimeTypes)
    ) {
      const allowedMimeTypes = documentType.allowedMimeTypes.filter(
        (value): value is string => typeof value === 'string',
      );
      if (
        allowedMimeTypes.length > 0 &&
        !allowedMimeTypes.includes(validatedFile.mimetype)
      ) {
        throw new BadRequestException(
          'This file type is not allowed for the selected document type.',
        );
      }
    }

    const stored = await this.storageService.saveFile({
      buffer: validatedFile.buffer,
      originalFileName: validatedFile.originalname,
      subdirectory: `${currentUser.tenantId}/documents/${dto.entityType.toLowerCase()}/${dto.entityId}`,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const document = await this.documentsRepository.createDocument(
        {
          tenantId: currentUser.tenantId,
          documentTypeId: dto.documentTypeId,
          documentCategoryId: dto.documentCategoryId,
          title: dto.title?.trim(),
          originalFileName: validatedFile.originalname,
          storedFileName: stored.storageKey.split('/').pop() ?? null,
          mimeType: validatedFile.mimetype,
          fileExtension: normalizeFileExtension(validatedFile.originalname),
          sizeInBytes: validatedFile.size,
          storageKey: stored.storageKey,
          uploadedByUserId: currentUser.userId,
          description: dto.description?.trim(),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      await this.documentsRepository.createLink(
        {
          tenantId: currentUser.tenantId,
          documentId: document.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
          ...buildEntityLinkFields(dto.entityType, dto.entityId),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      return this.documentsRepository.findById(
        currentUser.tenantId,
        document.id,
        tx,
      );
    });

    if (!created) {
      throw new NotFoundException('Document was not found after upload.');
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: created.id,
      afterSnapshot: this.mapDocument(created),
    });

    return this.mapDocument(created);
  }

  async update(
    currentUser: AuthenticatedUser,
    documentId: string,
    dto: UpdateDocumentDto,
  ) {
    const before = await this.documentsRepository.findById(
      currentUser.tenantId,
      documentId,
    );

    if (!before || before.isArchived) {
      throw new NotFoundException('Document was not found for this tenant.');
    }

    if (dto.documentTypeId !== undefined && dto.documentTypeId !== null) {
      await this.validateDocumentType(currentUser.tenantId, dto.documentTypeId);
    }

    if (
      dto.documentCategoryId !== undefined &&
      dto.documentCategoryId !== null
    ) {
      await this.validateDocumentCategory(
        currentUser.tenantId,
        dto.documentCategoryId,
      );
    }

    await this.documentsRepository.updateDocument(
      currentUser.tenantId,
      documentId,
      {
        ...(dto.documentTypeId !== undefined
          ? { documentTypeId: dto.documentTypeId }
          : {}),
        ...(dto.documentCategoryId !== undefined
          ? { documentCategoryId: dto.documentCategoryId }
          : {}),
        ...(dto.title !== undefined
          ? { title: dto.title?.trim() ?? null }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        updatedById: currentUser.userId,
      },
    );

    const after = await this.documentsRepository.findById(
      currentUser.tenantId,
      documentId,
    );

    if (!after) {
      throw new NotFoundException('Document was not found after update.');
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'DOCUMENT_UPDATED',
      entityType: 'Document',
      entityId: documentId,
      beforeSnapshot: this.mapDocument(before),
      afterSnapshot: this.mapDocument(after),
    });

    return this.mapDocument(after);
  }

  async archive(currentUser: AuthenticatedUser, documentId: string) {
    const document = await this.documentsRepository.findById(
      currentUser.tenantId,
      documentId,
    );

    if (!document || document.isArchived) {
      throw new NotFoundException('Document was not found for this tenant.');
    }

    await this.documentsRepository.archiveDocument(
      currentUser.tenantId,
      documentId,
      currentUser.userId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'DOCUMENT_ARCHIVED',
      entityType: 'Document',
      entityId: documentId,
      beforeSnapshot: this.mapDocument(document),
      afterSnapshot: { isArchived: true },
    });

    return { id: documentId, archived: true };
  }

  async openForView(tenantId: string, documentId: string) {
    const document = await this.documentsRepository.findById(
      tenantId,
      documentId,
    );

    if (!document || document.isArchived || !document.storageKey) {
      throw new NotFoundException('Document was not found for this tenant.');
    }

    return {
      document,
      file: await this.storageService.openFile(document.storageKey),
    };
  }

  async openForDownload(tenantId: string, documentId: string) {
    const documentSettings =
      await this.tenantSettingsResolverService.getDocumentSettings(tenantId);
    if (documentSettings.disableExternalDownloads) {
      throw new BadRequestException(
        'Document downloads are disabled by tenant document settings.',
      );
    }
    return this.openForView(tenantId, documentId);
  }

  listDocumentTypes(tenantId: string) {
    return this.documentsRepository.listDocumentTypes(tenantId);
  }

  async createDocumentType(
    currentUser: AuthenticatedUser,
    dto: CreateDocumentTypeDto,
  ) {
    const created = await this.prisma.documentType.create({
      data: {
        tenantId: dto.isGlobal ? null : currentUser.tenantId,
        key: dto.key.trim().toLowerCase(),
        name: dto.name.trim(),
        description: dto.description?.trim(),
        allowedMimeTypes: dto.allowedMimeTypes?.length
          ? dto.allowedMimeTypes.map((item) => item.trim())
          : undefined,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });

    return created;
  }

  listDocumentCategories(tenantId: string) {
    return this.documentsRepository.listDocumentCategories(tenantId);
  }

  async findDocumentCategoryById(tenantId: string, id: string) {
    const category = await this.prisma.documentCategory.findFirst({
      where: {
        id,
        OR: [{ tenantId }, { tenantId: null }],
      },
      include: { _count: { select: { documents: true } } },
    });
    if (!category) {
      throw new NotFoundException('Document category was not found.');
    }
    return category;
  }

  async createDocumentCategory(
    currentUser: AuthenticatedUser,
    dto: CreateDocumentCategoryDto,
  ) {
    const created = await this.prisma.documentCategory.create({
      data: {
        tenantId: dto.isGlobal ? null : currentUser.tenantId,
        code: normalizeCategoryCode(dto.code ?? dto.name),
        name: dto.name.trim(),
        description: dto.description?.trim(),
        appliesTo: normalizeStringList(dto.appliesTo, ['GENERAL']),
        expirable: dto.expirable ?? false,
        requiresVerification: dto.requiresVerification ?? false,
        defaultRetentionMonths: dto.defaultRetentionMonths,
        allowedExtensionsOverride: normalizeExtensions(
          dto.allowedExtensionsOverride,
        ),
        maximumUploadSizeOverrideMb: dto.maximumUploadSizeOverrideMb,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });

    return created;
  }

  async updateDocumentCategory(
    currentUser: AuthenticatedUser,
    id: string,
    dto: CreateDocumentCategoryDto,
  ) {
    const existing = await this.prisma.documentCategory.findFirst({
      where: {
        id,
        OR: [{ tenantId: currentUser.tenantId }, { tenantId: null }],
      },
    });
    if (!existing) {
      throw new NotFoundException('Document category was not found.');
    }
    if (existing.tenantId === null) {
      throw new BadRequestException(
        'Global document categories cannot be edited.',
      );
    }
    return this.prisma.documentCategory.update({
      where: { id },
      data: {
        ...(dto.code !== undefined
          ? { code: normalizeCategoryCode(dto.code) }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.appliesTo !== undefined
          ? { appliesTo: normalizeStringList(dto.appliesTo, ['GENERAL']) }
          : {}),
        ...(dto.expirable !== undefined ? { expirable: dto.expirable } : {}),
        ...(dto.requiresVerification !== undefined
          ? { requiresVerification: dto.requiresVerification }
          : {}),
        ...(dto.defaultRetentionMonths !== undefined
          ? { defaultRetentionMonths: dto.defaultRetentionMonths }
          : {}),
        ...(dto.allowedExtensionsOverride !== undefined
          ? {
              allowedExtensionsOverride: normalizeExtensions(
                dto.allowedExtensionsOverride,
              ),
            }
          : {}),
        ...(dto.maximumUploadSizeOverrideMb !== undefined
          ? { maximumUploadSizeOverrideMb: dto.maximumUploadSizeOverrideMb }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        updatedById: currentUser.userId,
      },
    });
  }

  async deactivateDocumentCategory(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.documentCategory.findFirst({
      where: { id, tenantId: currentUser.tenantId },
      include: { _count: { select: { documents: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Document category was not found.');
    }
    if (existing._count.documents > 0) {
      throw new BadRequestException(
        'Document category cannot be deleted while documents reference it.',
      );
    }
    return this.prisma.documentCategory.update({
      where: { id },
      data: { isActive: false, updatedById: currentUser.userId },
    });
  }

  private validateUploadedFile(
    file: UploadedFile | undefined,
    documentSettings: {
      maxUploadSizeMb: number;
      allowedExtensions: string[];
      blockedExtensions: string[];
      allowedMimeTypes: string[];
    },
  ) {
    if (!file) {
      throw new BadRequestException('A file upload is required.');
    }

    const settingsMimeTypes = new Set(documentSettings.allowedMimeTypes);
    const allowedMimeTypes =
      settingsMimeTypes.size > 0
        ? settingsMimeTypes
        : ALLOWED_DOCUMENT_MIME_TYPES;
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      throw new BadRequestException('Uploaded file type is not supported.');
    }

    const normalizedExtension = normalizeFileExtension(file.originalname);
    const extension = (normalizedExtension ?? '').replace('.', '');
    const allowedExtensions = new Set(
      documentSettings.allowedExtensions.map((value) => value.toLowerCase()),
    );
    const blockedExtensions = new Set(
      documentSettings.blockedExtensions.map((value) => value.toLowerCase()),
    );
    if (blockedExtensions.has(extension.toLowerCase())) {
      throw new BadRequestException(
        `Uploaded file extension .${extension} is blocked for this tenant.`,
      );
    }
    if (
      allowedExtensions.size > 0 &&
      !allowedExtensions.has(extension.toLowerCase())
    ) {
      throw new BadRequestException(
        `Uploaded file extension .${extension} is not allowed for this tenant.`,
      );
    }

    const configuredMaxBytes = documentSettings.maxUploadSizeMb * 1024 * 1024;
    const technicalMaxBytes = this.storageService.getMaxUploadBytes();
    const effectiveMaxBytes = Math.min(configuredMaxBytes, technicalMaxBytes);
    if (file.size > effectiveMaxBytes) {
      throw new BadRequestException(
        'Uploaded file exceeds the allowed size limit.',
      );
    }

    return file;
  }

  private async validateDocumentType(
    tenantId: string,
    documentTypeId?: string | null,
  ) {
    if (!documentTypeId) {
      return null;
    }

    const documentType = await this.prisma.documentType.findFirst({
      where: {
        id: documentTypeId,
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!documentType) {
      throw new BadRequestException(
        'Selected document type is not available for this tenant.',
      );
    }

    return documentType;
  }

  private async validateDocumentCategory(
    tenantId: string,
    documentCategoryId?: string | null,
  ) {
    if (!documentCategoryId) {
      return null;
    }

    const documentCategory = await this.prisma.documentCategory.findFirst({
      where: {
        id: documentCategoryId,
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!documentCategory) {
      throw new BadRequestException(
        'Selected document category is not available for this tenant.',
      );
    }

    return documentCategory;
  }

  private async assertValidLinkedEntity(
    tenantId: string,
    entityType: DocumentEntityType,
    entityId: string,
  ) {
    switch (entityType) {
      case DocumentEntityType.EMPLOYEE: {
        const employee = await this.prisma.employee.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!employee) {
          throw new BadRequestException(
            'Selected employee does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.PROJECT: {
        const project = await this.prisma.project.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!project) {
          throw new BadRequestException(
            'Selected project does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.LEAVE_REQUEST: {
        const leaveRequest = await this.prisma.leaveRequest.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!leaveRequest) {
          throw new BadRequestException(
            'Selected leave request does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.CANDIDATE: {
        const candidate = await this.prisma.candidate.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!candidate) {
          throw new BadRequestException(
            'Selected candidate does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.PAYROLL_RECORD: {
        const payrollRecord = await this.prisma.payrollRecord.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!payrollRecord) {
          throw new BadRequestException(
            'Selected payroll record does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.PAYSLIP: {
        const payslip = await this.prisma.payslip.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!payslip) {
          throw new BadRequestException(
            'Selected payslip does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.PAYROLL_BANK_EXPORT: {
        const bankExport = await this.prisma.payrollBankExport.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!bankExport) {
          throw new BadRequestException(
            'Selected payroll bank export does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.ONBOARDING_RECORD: {
        const onboarding = await this.prisma.employeeOnboarding.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!onboarding) {
          throw new BadRequestException(
            'Selected onboarding record does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.TENANT: {
        const tenant = await this.prisma.tenant.findFirst({
          where: { id: entityId },
          select: { id: true },
        });
        if (!tenant || tenant.id !== tenantId) {
          throw new BadRequestException(
            'Selected tenant record does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.INVOICE: {
        const invoice = await this.prisma.invoice.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        });
        if (!invoice) {
          throw new BadRequestException(
            'Selected invoice does not belong to this tenant.',
          );
        }
        return;
      }
      case DocumentEntityType.POLICY:
      case DocumentEntityType.OTHER:
        return;
      default:
        throw new BadRequestException('Unsupported document entity type.');
    }
  }

  private mapDocument(document: DocumentWithRelations) {
    return {
      id: document.id,
      tenantId: document.tenantId,
      documentTypeId: document.documentTypeId,
      documentCategoryId: document.documentCategoryId,
      title: document.title,
      originalFileName: document.originalFileName,
      storedFileName: document.storedFileName,
      mimeType: document.mimeType,
      fileExtension: document.fileExtension,
      sizeInBytes: document.sizeInBytes,
      storageKey: document.storageKey,
      description: document.description,
      isArchived: document.isArchived,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      documentType: document.documentType
        ? mapDocumentType(document.documentType)
        : null,
      documentCategory: document.documentCategory
        ? mapDocumentCategory(document.documentCategory)
        : null,
      uploadedByUser: document.uploadedByUser
        ? {
            id: document.uploadedByUser.id,
            firstName: document.uploadedByUser.firstName,
            lastName: document.uploadedByUser.lastName,
            fullName: `${document.uploadedByUser.firstName} ${document.uploadedByUser.lastName}`,
            email: document.uploadedByUser.email,
          }
        : null,
      links: document.links.map((link) => ({
        id: link.id,
        entityType: link.entityType,
        entityId: link.entityId,
        employeeId: link.employeeId,
        candidateId: link.candidateId,
        leaveRequestId: link.leaveRequestId,
        createdAt: link.createdAt,
      })),
      viewPath: `/api/documents/${document.id}/view`,
      downloadPath: `/api/documents/${document.id}/download`,
    };
  }
}

function normalizeFileExtension(fileName: string) {
  const extension = extname(fileName).trim().toLowerCase();
  return extension.length > 0 ? extension : null;
}

function normalizeCategoryCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function normalizeStringList(value: string[] | undefined, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : fallback;
}

function normalizeExtensions(value: string[] | undefined) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => item.trim().toLowerCase().replace(/^\.+/, ''))
        .filter(Boolean),
    ),
  ];
}

function buildEntityLinkFields(
  entityType: DocumentEntityType,
  entityId: string,
) {
  switch (entityType) {
    case DocumentEntityType.EMPLOYEE:
      return { employeeId: entityId };
    case DocumentEntityType.CANDIDATE:
      return { candidateId: entityId };
    case DocumentEntityType.LEAVE_REQUEST:
      return { leaveRequestId: entityId };
    default:
      return {};
  }
}

function mapDocumentType(documentType: {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  allowedMimeTypes?: Prisma.JsonValue;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return {
    id: documentType.id,
    key: documentType.key,
    name: documentType.name,
    description: documentType.description,
    allowedMimeTypes: documentType.allowedMimeTypes,
    isActive: documentType.isActive,
    sortOrder: documentType.sortOrder,
  };
}

function mapDocumentCategory(documentCategory: {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return {
    id: documentCategory.id,
    code: documentCategory.code,
    name: documentCategory.name,
    description: documentCategory.description,
    isActive: documentCategory.isActive,
    sortOrder: documentCategory.sortOrder,
  };
}
