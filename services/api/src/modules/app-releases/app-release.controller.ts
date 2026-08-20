import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApplicationArchitecture,
  ApplicationPlatform,
  ApplicationReleaseChannel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AppReleaseService } from './app-release.service';

class ListReleasesDto {
  @IsOptional() @IsString() @MaxLength(64) appKey?: string;
  @IsOptional() @IsEnum(ApplicationPlatform) platform?: ApplicationPlatform;
  @IsOptional()
  @IsEnum(ApplicationArchitecture)
  architecture?: ApplicationArchitecture;
  @IsOptional()
  @IsEnum(ApplicationReleaseChannel)
  channel?: ApplicationReleaseChannel;
}

class LatestReleaseDto {
  @IsString() @MaxLength(64) appKey!: string;
  @IsOptional() @IsEnum(ApplicationPlatform) platform?: ApplicationPlatform;
  @IsOptional()
  @IsEnum(ApplicationArchitecture)
  architecture?: ApplicationArchitecture;
  @IsOptional()
  @IsEnum(ApplicationReleaseChannel)
  channel?: ApplicationReleaseChannel;
}

class PublishReleaseDto {
  @IsString() @MaxLength(64) appKey!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsString() @MaxLength(40) version!: string;
  @IsEnum(ApplicationPlatform) platform!: ApplicationPlatform;
  @IsEnum(ApplicationArchitecture) architecture!: ApplicationArchitecture;
  @IsOptional()
  @IsEnum(ApplicationReleaseChannel)
  channel?: ApplicationReleaseChannel;
  @IsOptional() @IsString() @MaxLength(500) storageKey?: string;
  @IsOptional() @IsUrl({ require_tld: false }) externalUrl?: string;
  @IsOptional() @IsString() @MaxLength(255) fileName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) fileSizeBytes?: number;
  @IsOptional() @IsString() @MaxLength(128) checksumSha256?: string;
  @IsOptional() @IsString() @MaxLength(40) minimumSupportedVersion?: string;
  @IsOptional() @IsString() @MaxLength(4000) releaseNotes?: string;
  @IsOptional() @IsString() @MaxLength(120) requiredPermission?: string;
}

/**
 * Apps & downloads.
 *
 * Releases are global platform artefacts, so these routes are not tenant-scoped.
 * Access is decided by channel visibility plus per-release permission, both
 * applied inside the query — see AppReleaseService. `appDownloads.read` gates
 * the catalogue; individual artefacts may require more.
 */
@Controller('app-releases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppReleaseController {
  constructor(private readonly service: AppReleaseService) {}

  @Get()
  @Permissions('appDownloads.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListReleasesDto,
  ) {
    return this.service.list(AppReleaseService.toViewer(user), query);
  }

  @Get('latest')
  @Permissions('appDownloads.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  latest(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LatestReleaseDto,
  ) {
    return this.service.latest(AppReleaseService.toViewer(user), query);
  }

  @Get(':id')
  @Permissions('appDownloads.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findOne(AppReleaseService.toViewer(user), id);
  }

  /**
   * Streams through the app rather than exposing a storage URL, so the same
   * visibility and permission checks apply to the bytes as to the metadata.
   */
  @Get(':id/download')
  @Permissions('appDownloads.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.download(
      AppReleaseService.toViewer(user),
      id,
    );

    if (result.kind === 'redirect') {
      response.redirect(302, result.url);
      return undefined;
    }

    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    if (result.checksumSha256) {
      response.setHeader('X-Checksum-Sha256', result.checksumSha256);
    }
    return result.file;
  }

  @Post()
  @Permissions('appDownloads.manage')
  @RequirePermission(ENTITY_KEYS.AGENT, 'manage')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PublishReleaseDto,
  ) {
    return this.service.publish(user, dto);
  }

  @Post(':id/disable')
  @Permissions('appDownloads.manage')
  @RequirePermission(ENTITY_KEYS.AGENT, 'manage')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.setActive(user, id, false);
  }

  @Post(':id/enable')
  @Permissions('appDownloads.manage')
  @RequirePermission(ENTITY_KEYS.AGENT, 'manage')
  enable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.setActive(user, id, true);
  }
}
