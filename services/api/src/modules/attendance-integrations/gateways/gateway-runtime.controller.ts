import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IntegrationRunStatus, IntegrationRunType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { GatewayConfigurationService } from './gateway-configuration.service';
import {
  GatewayAuthGuard,
  type GatewayAuthenticatedRequest,
} from './gateway-auth.guard';
import { GatewayRuntimeService } from './gateway-runtime.service';

/**
 * The gateway runtime surface: configuration in, operational facts out.
 *
 * Separate controller, same machine-only guard as the ingestion routes. None of
 * these routes accepts a tenant id; every one of them derives tenant and gateway
 * from the presented service credential. A browser session cannot reach any of
 * them, which is what allows this controller — and only this controller — to
 * return decrypted connector secrets.
 */

/** Device wall clock: no timezone, and never coerced into one. */
const LOCAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

class VerificationDto {
  @IsUUID() deviceId!: string;
  @IsBoolean() connected!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(600_000) latencyMs?: number;
  @IsOptional() @IsString() @MaxLength(120) actualSerialNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(120) firmwareVersion?: string;
  @IsOptional() @IsString() @MaxLength(120) platform?: string;
  @IsOptional() @IsString() @MaxLength(64) macAddress?: string;
  @IsOptional() @Matches(LOCAL_TIMESTAMP) deviceTimeLocal?: string;
  // Bounded well past any plausible drift, so a nonsense value is rejected
  // rather than stored as a fact about the customer's terminal.
  @IsOptional()
  @IsInt()
  @Min(-31_536_000)
  @Max(31_536_000)
  clockDriftSeconds?: number;
  @IsOptional() @IsString() @MaxLength(120) errorCode?: string;
  @IsOptional() @IsString() @MaxLength(500) errorMessage?: string;
}

class DiscoveredUserDto {
  @IsString() @MaxLength(64) externalUserId!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() privilegeRaw?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  // There is deliberately no password field. The worker discards the value the
  // SDK returns before it can cross a process boundary; nothing here could
  // accept one even if a connector tried to send it.
}

/** Bound on one discovery upload. Terminals hold hundreds, not millions. */
const MAX_DISCOVERED_USERS = 10_000;

class DiscoveredUsersDto {
  @IsUUID() integrationId!: string;
  @IsOptional() @IsUUID() deviceId?: string;

  @IsArray()
  @ArrayMaxSize(MAX_DISCOVERED_USERS)
  @ValidateNested({ each: true })
  @Type(() => DiscoveredUserDto)
  users!: DiscoveredUserDto[];
}

class RunReportDto {
  @IsUUID() integrationId!: string;
  @IsOptional() @IsUUID() deviceId?: string;
  @IsEnum(IntegrationRunType) runType!: IntegrationRunType;
  @IsEnum(IntegrationRunStatus) status!: IntegrationRunStatus;
  @IsISO8601() startedAt!: string;
  @IsOptional() @IsISO8601() completedAt?: string;
  @IsOptional() @IsInt() @Min(0) durationMs?: number;
  @IsOptional() @IsInt() @Min(0) recordsRead?: number;
  @IsOptional() @IsInt() @Min(0) recordsNew?: number;
  @IsOptional() @IsInt() @Min(0) recordsDuplicate?: number;
  @IsOptional() @IsInt() @Min(0) recordsMapped?: number;
  @IsOptional() @IsInt() @Min(0) recordsUnmapped?: number;
  @IsOptional() @IsInt() @Min(0) recordsFailed?: number;
  @IsOptional() @IsString() @MaxLength(120) errorCode?: string;
  @IsOptional() @IsString() @MaxLength(500) errorMessage?: string;
  @IsOptional() @IsString() @MaxLength(120) correlationId?: string;
  @IsOptional() @IsISO8601() acknowledgesSyncRequestedAt?: string;
}

class ClaimJobsDto {
  @IsOptional() @IsInt() @Min(1) @Max(25) limit?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  deviceIds?: string[];
}

class ProvisioningResultDto {
  @IsUUID() jobId!: string;
  @IsBoolean() succeeded!: boolean;
  @IsOptional() @IsString() @MaxLength(64) resultExternalUserId?: string;
  @IsOptional() @IsString() @MaxLength(120) errorCode?: string;
  @IsOptional() @IsString() @MaxLength(500) errorMessage?: string;
}

@Controller('integrations/gateway')
@UseGuards(GatewayAuthGuard)
export class GatewayRuntimeController {
  constructor(
    private readonly configuration: GatewayConfigurationService,
    private readonly runtime: GatewayRuntimeService,
  ) {}

  /**
   * Everything this gateway is assigned.
   *
   * Includes decrypted connector secrets — a comm key is what opens the session
   * with the terminal, and the gateway is the only caller that can use one. The
   * browser-facing API returns a presence flag and nothing else.
   */
  @Get('configuration')
  async getConfiguration(@Req() request: GatewayAuthenticatedRequest) {
    const { tenantId, gatewayId, gatewayName } = request.gateway;
    return this.configuration.buildFor(tenantId, gatewayId, gatewayName);
  }

  @Post('devices/verification')
  @HttpCode(200)
  async recordVerification(
    @Body() dto: VerificationDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    return this.runtime.recordVerification(request.gateway, dto);
  }

  @Post('devices/users')
  @HttpCode(200)
  async recordUsers(
    @Body() dto: DiscoveredUsersDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    if (!Array.isArray(dto.users)) {
      throw new BadRequestException('users must be an array.');
    }
    return this.runtime.recordDiscoveredUsers(request.gateway, dto);
  }

  @Post('runs')
  @HttpCode(200)
  async recordRun(
    @Body() dto: RunReportDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    return this.runtime.recordRun(request.gateway, dto);
  }

  /**
   * Takes provisioning work under a server-side lease.
   *
   * POST rather than GET: claiming mutates state. A gateway that crashes holding
   * a claim loses it when the lease expires, so nothing is stranded, and the
   * conditional update means two gateways cannot both win the same job.
   */
  @Post('provisioning/claim')
  @HttpCode(200)
  async claimJobs(
    @Body() dto: ClaimJobsDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    return this.runtime.claimProvisioningJobs(request.gateway, dto);
  }

  @Post('provisioning/result')
  @HttpCode(200)
  async reportResult(
    @Body() dto: ProvisioningResultDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    return this.runtime.reportProvisioningResult(request.gateway, dto);
  }
}
