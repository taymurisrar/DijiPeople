import { Injectable } from '@nestjs/common';
import { DocumentEntityType, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

@Injectable()
export class PayrollOutputDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async store(params: {
    tenantId: string;
    actorUserId: string;
    entityType: DocumentEntityType;
    entityId: string;
    title: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
    description?: string;
    tx?: Prisma.TransactionClient;
  }) {
    const db = params.tx ?? this.prisma;
    const stored = await this.storage.saveFile({
      buffer: params.buffer,
      originalFileName: params.fileName,
      subdirectory: `${params.tenantId}/documents/${params.entityType.toLowerCase()}/${params.entityId}`,
    });
    const document = await db.document.create({
      data: {
        tenantId: params.tenantId,
        title: params.title,
        originalFileName: params.fileName,
        storedFileName: stored.storageKey.split('/').pop() ?? null,
        mimeType: params.contentType,
        fileExtension: extensionFor(params.fileName),
        sizeInBytes: stored.size,
        storageKey: stored.storageKey,
        uploadedByUserId: params.actorUserId,
        description: params.description,
        createdById: params.actorUserId,
        updatedById: params.actorUserId,
      },
    });
    await db.documentLink.create({
      data: {
        tenantId: params.tenantId,
        documentId: document.id,
        entityType: params.entityType,
        entityId: params.entityId,
        createdById: params.actorUserId,
        updatedById: params.actorUserId,
      },
    });
    return {
      document,
      checksum: createHash('sha256').update(params.buffer).digest('hex'),
    };
  }

  open(documentId: string, tenantId: string) {
    return this.prisma.document.findFirst({
      where: { tenantId, id: documentId, isArchived: false },
    });
  }
}

function extensionFor(fileName: string) {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : null;
}
