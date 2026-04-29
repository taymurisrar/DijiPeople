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
import { DocumentEntityType } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsService } from './documents.service';

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
  @Permissions('documents.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DocumentQueryDto,
  ) {
    return this.documentsService.findByTenant(user.tenantId, query);
  }

  @Get('entity/:entityType/:entityId')
  @Permissions('documents.read')
  findByEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entityType', new ParseEnumPipe(DocumentEntityType))
    entityType: DocumentEntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.documentsService.findByEntity(
      user.tenantId,
      entityType,
      entityId,
    );
  }

  @Get('types')
  @Permissions('documents.read')
  listTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listDocumentTypes(user.tenantId);
  }

  @Post('types')
  @Permissions('documents.types.manage')
  createType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentTypeDto,
  ) {
    return this.documentsService.createDocumentType(user, dto);
  }

  @Get('categories')
  @Permissions('documents.read')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.listDocumentCategories(user.tenantId);
  }

  @Post('categories')
  @Permissions('documents.categories.manage')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentCategoryDto,
  ) {
    return this.documentsService.createDocumentCategory(user, dto);
  }

  @Post('upload')
  @Permissions('documents.upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    return this.documentsService.upload(user, dto, file);
  }

  @Get(':documentId')
  @Permissions('documents.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.documentsService.findById(user.tenantId, documentId);
  }

  @Get(':documentId/view')
  @Permissions('documents.read')
  async view(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } = await this.documentsService.openForView(
      user.tenantId,
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
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { document, file } = await this.documentsService.openForDownload(
      user.tenantId,
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
  @Permissions('documents.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(user, documentId, dto);
  }

  @Delete(':documentId')
  @Permissions('documents.delete')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.documentsService.archive(user, documentId);
  }
}
