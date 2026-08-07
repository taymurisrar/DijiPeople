import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataImportMode } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ImportAnalysisService } from './import-analysis.service';
import { ExportExecutionService } from './export-execution.service';
import { ImportExecutionService } from './import-execution.service';
import { DataModuleRegistryService } from './module-registry.service';
import { DataTemplateService } from './template.service';

const VIEW_PERMISSION = 'data-management.view';
const TEMPLATE_PERMISSION = 'data-management.template.download';
const VALIDATE_PERMISSION = 'data-management.import.validate';
const EXECUTE_PERMISSION = 'data-management.import.execute';
const CANCEL_PERMISSION = 'data-management.import.cancel';
const EXPORT_PERMISSION = 'data-management.export';

/** Rejects an unknown mode rather than silently writing records. */
function parseImportMode(
  value: string | undefined,
): DataImportMode | undefined {
  if (!value) return undefined;

  const allowed = Object.values(DataImportMode) as string[];
  if (!allowed.includes(value)) {
    throw new BadRequestException(
      `Import mode must be one of: ${allowed.join(', ')}.`,
    );
  }

  return value as DataImportMode;
}

type MulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('data-management')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DataManagementController {
  constructor(
    private readonly registry: DataModuleRegistryService,
    private readonly templates: DataTemplateService,
    private readonly imports: ImportAnalysisService,
    private readonly execution: ImportExecutionService,
    private readonly exports: ExportExecutionService,
  ) {}

  /** Modules available for import and export, used to populate the wizard. */
  @Get('modules')
  @Permissions(VIEW_PERMISSION)
  listModules() {
    return this.registry.listModules().map((module) => ({
      moduleKey: module.moduleKey,
      label: module.label,
      supportsImport: module.supportsImport,
      supportsExport: module.supportsExport,
      matchingKeys: module.matchingKeys,
      fieldCount: module.importFields.length,
      requiredFieldCount: module.importFields.filter((field) => field.required)
        .length,
    }));
  }

  /** Full field metadata for one module, used by mapping and validation. */
  @Get('modules/:moduleKey/fields')
  @Permissions(VIEW_PERMISSION)
  getModuleFields(@Param('moduleKey') moduleKey: string) {
    return this.registry.getModule(moduleKey);
  }

  @Get('modules/:moduleKey/template')
  @Permissions(TEMPLATE_PERMISSION)
  async downloadTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.templates.buildImportTemplate(
      user.tenantId,
      moduleKey,
    );

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/["\\]/g, '')}"`,
    );

    return new StreamableFile(file.buffer);
  }

  /**
   * Uploads a file and returns the mapping and validation result.
   *
   * This writes no module data. It only records the analysis so a user can see
   * exactly what would happen before anyone is allowed to execute the import.
   */
  @Post('modules/:moduleKey/imports/analyse')
  @Permissions(VALIDATE_PERMISSION)
  @UseInterceptors(FileInterceptor('file'))
  analyseImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleKey') moduleKey: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body('sheetName') sheetName?: string,
    @Body('importMode') importMode?: string,
  ) {
    return this.imports.analyseUpload(user, moduleKey, file, {
      sheetName,
      importMode: parseImportMode(importMode),
    });
  }

  /** Queues an export; the worker produces the file. */
  @Post('exports')
  @Permissions(EXPORT_PERMISSION)
  queueExport(
    @CurrentUser() user: AuthenticatedUser,
    @Body('moduleKey') moduleKey: string,
    @Body('filters') filters?: Record<string, unknown>,
  ) {
    if (!moduleKey?.trim()) {
      throw new BadRequestException('A module is required to export.');
    }

    return this.exports.queueExport(user, moduleKey.trim(), filters ?? {});
  }

  @Get('exports/:jobId/status')
  @Permissions(EXPORT_PERMISSION)
  getExportStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ) {
    return this.exports.getExportSummary(user, jobId);
  }

  @Get('exports/:jobId/download')
  @Permissions(EXPORT_PERMISSION)
  async downloadExport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exports.openExportFile(user, jobId);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/["\\]/g, '')}"`,
    );

    return new StreamableFile(file.stream);
  }

  /** Import history for this tenant. */
  @Get('imports')
  @Permissions(VIEW_PERMISSION)
  listImports(
    @CurrentUser() user: AuthenticatedUser,
    @Query('moduleKey') moduleKey?: string,
  ) {
    return this.execution.listJobs(user, moduleKey);
  }

  /** Queues the validated rows; the worker writes them through the module. */
  @Post('imports/:jobId/execute')
  @Permissions(EXECUTE_PERMISSION)
  executeImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ) {
    return this.execution.queueJob(user, jobId);
  }

  /** Progress for a running or finished import, for polling. */
  @Get('imports/:jobId/status')
  @Permissions(VIEW_PERMISSION)
  getImportStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ) {
    return this.execution.getExecutionSummary(user, jobId);
  }

  @Post('imports/:jobId/cancel')
  @Permissions(CANCEL_PERMISSION)
  cancelImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ) {
    return this.execution.cancelJob(user, jobId);
  }

  /** Workbook of the rows that failed, for correction and re-upload. */
  @Get('imports/:jobId/errors')
  @Permissions(VALIDATE_PERMISSION)
  async downloadErrors(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.execution.buildErrorWorkbook(user, jobId);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/["\\]/g, '')}"`,
    );

    return new StreamableFile(file.buffer);
  }

  /** Mapping, counts and the invalid rows for a previously analysed upload. */
  @Get('imports/:jobId')
  @Permissions(VALIDATE_PERMISSION)
  getImportJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ) {
    return this.imports.getJob(user, jobId);
  }
}
