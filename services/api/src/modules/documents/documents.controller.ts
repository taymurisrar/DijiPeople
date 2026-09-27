import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { uploadLimits } from '../../common/storage/upload-limits';
import { DocumentEntityType } from '@prisma/client';
import type { Response } from 'express';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsService } from './documents.service';
import { CustomFields } from '../customization/custom-fields.decorator';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @CustomFields('documents', 'list')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DocumentQueryDto,
  ) {
    return this.documentsService.findByTenant(user, query);
  }

  @Get('entity/:entityType/:entityId')
  @CustomFields('documents', 'list')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  findByEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entityType', new ParseEnumPipe(DocumentEntityType))
    entityType: DocumentEntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.documentsService.findByEntity(user, entityType, entityId);
  }

  @Get('types')
  @CustomFields('documentTypes', 'list')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  listTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listDocumentTypes(user.tenantId);
  }

  @Post('types')
  @CustomFields('documentTypes', 'create')
  @Permissions('documents.types.manage')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'configure')
  createType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentTypeDto,
  ) {
    return this.documentsService.createDocumentType(user, dto);
  }

  @Get('types/:id')
  @CustomFields('documentTypes', 'read', 'id')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  findType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.documentsService.findDocumentTypeById(user.tenantId, id);
  }

  @Patch('types/:id')
  @CustomFields('documentTypes', 'update', 'id')
  @Permissions('documents.types.manage')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'configure')
  updateType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.documentsService.updateDocumentType(user, id, dto);
  }

  @Get('categories')
  @CustomFields('documentCategories', 'list')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listDocumentCategories(user.tenantId);
  }

  @Get('categories/:id')
  @CustomFields('documentCategories', 'read', 'id')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  findCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.documentsService.findDocumentCategoryById(user.tenantId, id);
  }

  @Post('categories')
  @CustomFields('documentCategories', 'create')
  @Permissions('documents.categories.manage')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'configure')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentCategoryDto,
  ) {
    return this.documentsService.createDocumentCategory(user, dto);
  }

  @Patch('categories/:id')
  @CustomFields('documentCategories', 'update', 'id')
  @Permissions('documents.categories.manage')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'configure')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateDocumentCategoryDto,
  ) {
    return this.documentsService.updateDocumentCategory(user, id, dto);
  }

  @Delete('categories/:id')
  @Permissions('documents.categories.manage')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'configure')
  deactivateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.documentsService.deactivateDocumentCategory(user, id);
  }

  @Post('upload')
  @Permissions('documents.upload')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'create')
  @UseInterceptors(FileInterceptor('file', uploadLimits('document')))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    return this.documentsService.upload(user, dto, file);
  }

  @Get(':documentId')
  @CustomFields('documents', 'read', 'documentId')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.documentsService.findById(user, documentId);
  }

  @Get(':documentId/view')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  async view(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } = await this.documentsService.openForView(
      user,
      documentId,
    );
    response.setHeader(
      'Content-Type',
      document.mimeType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${document.originalFileName}"`,
    );
    return new StreamableFile(file.stream);
  }

  @Get(':documentId/download')
  @Permissions('documents.read')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'read')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } = await this.documentsService.openForDownload(
      user,
      documentId,
    );
    response.setHeader(
      'Content-Type',
      document.mimeType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.originalFileName}"`,
    );
    return new StreamableFile(file.stream);
  }

  @Patch(':documentId')
  @CustomFields('documents', 'update', 'documentId')
  @Permissions('documents.update')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(user, documentId, dto);
  }

  @Delete(':documentId')
  @Permissions('documents.delete')
  @RequirePermission(ENTITY_KEYS.DOCUMENTS, 'delete')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.documentsService.archive(user, documentId);
  }
}
