import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ImportAnalysisService } from './import-analysis.service';
import { DataModuleRegistryService } from './module-registry.service';
import { DataTemplateService } from './template.service';

const VIEW_PERMISSION = 'data-management.view';
const TEMPLATE_PERMISSION = 'data-management.template.download';
const VALIDATE_PERMISSION = 'data-management.import.validate';

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
  ) {
    return this.imports.analyseUpload(user, moduleKey, file, { sheetName });
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
