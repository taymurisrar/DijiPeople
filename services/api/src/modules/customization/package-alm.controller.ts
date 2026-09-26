import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { uploadLimits } from '../../common/storage/upload-limits';
import { CustomizationAccessGuard } from './customization-access.guard';
import { PackageAlmService } from './package-alm.service';
import {
  CreateCustomizationPublisherDto,
  CreateEnvironmentVariableDto,
  ExecutePackageImportDto,
  ReleasePackageDto,
  SetEnvironmentVariableValueDto,
  SetPackageDependenciesDto,
} from './dto/package-alm.dto';

type UploadedPackageFile = {
  buffer: Buffer;
  originalname?: string;
  size?: number;
};

/*
 * Package lifecycle endpoints — TASK-0033. Same guard stack as the rest of
 * Customization: CustomizationAccessGuard requires the declared key even of
 * elevated roles (ADR-0013). Everything here is usable without a browser, so a
 * future CLI or CI pipeline drives the same service.
 */
@Controller('customization')
@UseGuards(JwtAuthGuard, PermissionsGuard, CustomizationAccessGuard)
export class PackageAlmController {
  constructor(private readonly packages: PackageAlmService) {}

  @Get('publishers')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  listPublishers(@CurrentUser() user: AuthenticatedUser) {
    return this.packages.listPublishers(user);
  }

  @Post('publishers')
  @Permissions('customization.packages.manage')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'configure')
  createPublisher(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomizationPublisherDto,
  ) {
    return this.packages.createPublisher(user, dto);
  }

  @Get('packages/:packageId/lifecycle')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  getLifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.packages.getLifecycle(user, packageId);
  }

  @Put('packages/:packageId/dependencies')
  @Permissions('customization.packages.manage')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'configure')
  setDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Body() dto: SetPackageDependenciesDto,
  ) {
    return this.packages.setDependencies(user, packageId, dto);
  }

  @Get('packages/:packageId/release-readiness')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  releaseReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.packages.validateForRelease(user, packageId);
  }

  @Post('packages/:packageId/release')
  @Permissions('customization.packages.release')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'configure')
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Body() dto: ReleasePackageDto,
  ) {
    return this.packages.release(user, packageId, dto);
  }

  @Get('packages/:packageId/versions')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.packages.listVersions(user, packageId);
  }

  @Get('packages/:packageId/versions/:version/artifact')
  @Permissions('customization.export')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'export')
  async downloadVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Param('version') version: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.packages.exportVersion(
      user,
      packageId,
      version === 'latest' ? undefined : version,
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.dijipeople.package+json',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName.replace(/["\\]/g, '')}"`,
    );
    response.setHeader('X-Package-Checksum', file.checksum);
    return new StreamableFile(Buffer.from(file.content, 'utf8'));
  }

  @Post('package-imports/analyze')
  @Permissions('customization.packages.import')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'import')
  @UseInterceptors(
    FileInterceptor('file', uploadLimits('customizationPackage')),
  )
  analyzeImport(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedPackageFile | undefined,
  ) {
    return this.packages.analyzeImport(user, file);
  }

  @Post('package-imports/:operationId/execute')
  @Permissions('customization.packages.import')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'import')
  executeImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('operationId') operationId: string,
    @Body() dto: ExecutePackageImportDto,
  ) {
    return this.packages.executeImport(user, operationId, dto);
  }

  @Get('package-operations')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  listOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('packageKey') packageKey?: string,
    @Query('take') take?: string,
  ) {
    return this.packages.listOperations(user, {
      packageKey: packageKey || undefined,
      take: take ? Number.parseInt(take, 10) || undefined : undefined,
    });
  }

  @Get('package-operations/:operationId')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  getOperation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('operationId') operationId: string,
  ) {
    return this.packages.getOperation(user, operationId);
  }

  @Get('packages/:packageId/uninstall-check')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  uninstallCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.packages.uninstallCheck(user, packageId);
  }

  @Post('packages/:packageId/uninstall')
  @Permissions('customization.packages.uninstall')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'delete')
  uninstall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.packages.uninstall(user, packageId);
  }

  @Post('packages/:packageId/detach')
  @Permissions('customization.packages.uninstall')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'configure')
  detach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.packages.detach(user, packageId);
  }

  @Get('components/:componentId/dependencies')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  componentDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('componentId') componentId: string,
  ) {
    return this.packages.componentDependencies(user, componentId);
  }

  @Get('environment-variables')
  @Permissions('customization.read')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'read')
  listEnvironmentVariables(@CurrentUser() user: AuthenticatedUser) {
    return this.packages.listEnvironmentVariables(user);
  }

  @Post('environment-variables')
  @Permissions('customization.packages.manage')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'configure')
  createEnvironmentVariable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEnvironmentVariableDto,
  ) {
    return this.packages.createEnvironmentVariable(user, dto);
  }

  @Put('environment-variables/:variableId/value')
  @Permissions('customization.packages.manage')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'configure')
  setEnvironmentVariableValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variableId') variableId: string,
    @Body() dto: SetEnvironmentVariableValueDto,
  ) {
    return this.packages.setEnvironmentVariableValue(
      user,
      variableId,
      dto.value,
    );
  }
}
