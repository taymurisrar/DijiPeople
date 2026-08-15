import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApplicationArchitecture,
  ApplicationPlatform,
  ApplicationReleaseChannel,
} from '@prisma/client';
import {
  IsBooleanString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { Public } from '../../common/decorators/public.decorator';
import { AppError } from '../../common/errors/app-error';
import {
  ReleasePublishTokenGuard,
  type ReleasePublisherRequest,
} from './release-publish-token.guard';
import { DEFAULT_RELEASE_ARTIFACT_MAX_BYTES } from './release-publisher.constants';
import { ReleasePublisherService } from './release-publisher.service';

/**
 * Multer's shape, declared locally.
 *
 * `@types/multer` is not installed, so `Express.Multer.File` does not exist in
 * this build — the same reason `documents.controller.ts` declares its own. Only
 * the four fields actually read are named.
 */
type UploadedArtifact = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

/**
 * Multipart fields arrive as strings, always. `forbidNonWhitelisted` is on
 * globally, so every field the CLI sends must be declared here or the request
 * is a 400 — which is the intended contract, not an obstacle: an unrecognised
 * field usually means the CLI and the API disagree about the release shape.
 */
class PublishArtifactDto {
  @IsString() @MaxLength(64) app!: string;
  @IsString() @MaxLength(40) version!: string;
  @IsEnum(ApplicationReleaseChannel) channel!: ApplicationReleaseChannel;
  @IsOptional() @IsEnum(ApplicationPlatform) platform?: ApplicationPlatform;
  @IsOptional()
  @IsEnum(ApplicationArchitecture)
  architecture?: ApplicationArchitecture;
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i, {
    message: 'checksumSha256 must be a 64-character hex SHA-256 digest.',
  })
  checksumSha256?: string;
  @IsOptional() @IsString() @MaxLength(4000) releaseNotes?: string;
  @IsOptional() @IsString() @MaxLength(40) minimumSupportedVersion?: string;
  @IsString() @MaxLength(32) environment!: string;
  @IsOptional() @IsBooleanString() dryRun?: string;
}

class PromoteReleaseDto {
  @IsString() @MaxLength(64) app!: string;
  @IsString() @MaxLength(40) version!: string;
  @IsEnum(ApplicationReleaseChannel) toChannel!: ApplicationReleaseChannel;
  @IsOptional()
  @IsEnum(ApplicationReleaseChannel)
  fromChannel?: ApplicationReleaseChannel;
  @IsOptional() @IsEnum(ApplicationPlatform) platform?: ApplicationPlatform;
  @IsOptional()
  @IsEnum(ApplicationArchitecture)
  architecture?: ApplicationArchitecture;
  @IsOptional() @IsString() @MaxLength(4000) releaseNotes?: string;
  @IsString() @MaxLength(32) environment!: string;
  @IsOptional() @IsBooleanString() dryRun?: string;
}

class DescribeReleasesDto {
  @IsString() @MaxLength(64) app!: string;
  @IsOptional() @IsString() @MaxLength(40) version?: string;
  @IsOptional()
  @IsEnum(ApplicationReleaseChannel)
  channel?: ApplicationReleaseChannel;
  @IsOptional() @IsEnum(ApplicationPlatform) platform?: ApplicationPlatform;
  @IsOptional()
  @IsEnum(ApplicationArchitecture)
  architecture?: ApplicationArchitecture;
}

/**
 * The release publishing endpoint.
 *
 * `@Public()` here means "no USER session", not "unauthenticated" — every route
 * is behind `ReleasePublishTokenGuard`, which fails closed when
 * `RELEASE_PUBLISH_TOKEN` is not configured. The decorator exists because
 * JwtAuthGuard is what `@Public()` speaks to, and a CI job has no cookie jar; a
 * machine credential is the authentication, and it is a narrower one than a
 * platform administrator's session would be.
 *
 * These routes sit under `/app-releases/publisher/...` rather than in a new
 * module so the release catalogue keeps exactly one owner. Reading and
 * downloading releases is unchanged and still goes through AppReleaseController.
 */
@Controller('app-releases/publisher')
@UseGuards(ReleasePublishTokenGuard)
export class ReleasePublisherController {
  constructor(private readonly service: ReleasePublisherService) {}

  @Post('publish')
  @Public()
  @UseInterceptors(
    FileInterceptor('artifact', {
      // Multer's own ceiling. The service checks the size again against
      // RELEASE_ARTIFACT_MAX_BYTES, because this one is fixed at module load
      // and the configured limit may be lower.
      limits: { fileSize: DEFAULT_RELEASE_ARTIFACT_MAX_BYTES, files: 1 },
    }),
  )
  publish(
    @Req() request: ReleasePublisherRequest,
    @Body() dto: PublishArtifactDto,
    @UploadedFile() artifact?: UploadedArtifact,
  ) {
    if (!artifact) {
      throw new AppError('RELEASE_ARTIFACT_INVALID', {
        description:
          'No artefact was attached. Send the package as the multipart field "artifact".',
      });
    }

    return this.service.publish(
      {
        appKey: dto.app,
        version: dto.version,
        channel: dto.channel,
        platform: dto.platform,
        architecture: dto.architecture,
        fileName: artifact.originalname,
        artifact: artifact.buffer,
        declaredChecksumSha256: dto.checksumSha256,
        releaseNotes: dto.releaseNotes,
        minimumSupportedVersion: dto.minimumSupportedVersion,
        targetEnvironment: dto.environment,
        dryRun: dto.dryRun === 'true',
      },
      this.identity(request),
    );
  }

  @Post('promote')
  @Public()
  promote(
    @Req() request: ReleasePublisherRequest,
    @Body() dto: PromoteReleaseDto,
  ) {
    return this.service.promote(
      {
        appKey: dto.app,
        version: dto.version,
        toChannel: dto.toChannel,
        fromChannel: dto.fromChannel,
        platform: dto.platform,
        architecture: dto.architecture,
        releaseNotes: dto.releaseNotes,
        targetEnvironment: dto.environment,
        dryRun: dto.dryRun === 'true',
      },
      this.identity(request),
    );
  }

  /** Read-back for verification. Reports retrievability without streaming bytes. */
  @Get('releases')
  @Public()
  describe(@Query() query: DescribeReleasesDto) {
    return this.service.describe({
      appKey: query.app,
      version: query.version,
      channel: query.channel,
      platform: query.platform,
      architecture: query.architecture,
    });
  }

  private identity(request: ReleasePublisherRequest) {
    // The guard sets this before any handler runs; if it is absent the guard did
    // not run, and publishing without an authenticated credential must not be
    // reachable by a wiring mistake.
    const identity = request.releasePublisher;
    if (!identity) {
      throw new AppError('RELEASE_PUBLISH_UNAUTHORIZED');
    }
    return identity;
  }
}
