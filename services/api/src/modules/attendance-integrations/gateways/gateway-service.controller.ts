import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IntegrationGatewayStatus } from '@prisma/client';

import { PublicRateLimitGuard } from '../../../common/guards/public-rate-limit.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RawAttendanceIngestionService } from '../ingestion/raw-attendance-ingestion.service';
import {
  GatewayAuthGuard,
  type GatewayAuthenticatedRequest,
} from './gateway-auth.guard';
import { GatewayCredentialService } from './gateway-credential.service';

/**
 * The gateway-facing surface. Machine callers only.
 *
 * Every route here authenticates with a gateway service credential, never an
 * employee JWT, and derives tenant identity server-side from that credential.
 * The web app cannot reach these routes and a gateway cannot reach the web app's.
 */

class GatewayPairDto {
  @IsString()
  @MaxLength(64)
  pairingCode!: string;

  @IsOptional() @IsString() @MaxLength(64) version?: string;
  @IsOptional() @IsString() @MaxLength(64) platform?: string;
  @IsOptional() @IsString() @MaxLength(32) architecture?: string;
  @IsOptional() @IsArray() capabilities?: string[];
}

class GatewayHeartbeatDto {
  @IsOptional() @IsString() @MaxLength(64) version?: string;
  @IsOptional() @IsString() @MaxLength(64) platform?: string;
  @IsOptional() @IsString() @MaxLength(32) architecture?: string;
  @IsOptional() @IsArray() capabilities?: string[];
  /** Gateway's own clock, recorded for drift diagnostics only. */
  @IsOptional() @IsString() @MaxLength(40) localTimestamp?: string;
  @IsOptional() @IsInt() devicesOnline?: number;
  @IsOptional() @IsInt() devicesUnreachable?: number;
  /**
   * Queue telemetry. Depth and age only — the queued punches themselves stay on
   * the customer machine until they go through the ingestion route, so a
   * heartbeat never becomes a second, unvalidated ingestion path.
   */
  @IsOptional() @IsInt() @Min(0) pendingQueueCount?: number;
  @IsOptional() @IsString() @MaxLength(40) oldestPendingEventAt?: string;
  @IsOptional() @IsString() @MaxLength(40) lastSuccessfulUploadAt?: string;
  /** Stable per-install id, so a reinstall is distinguishable from a restart. */
  @IsOptional() @IsString() @MaxLength(64) installationId?: string;
  /** Set when the gateway itself knows it is unwell (worker failures, backlog). */
  @IsOptional() @IsBoolean() degraded?: boolean;
}

class IngestEventDto {
  @IsString() @MaxLength(64) externalUserId!: string;
  @IsString() @MaxLength(32) occurredAtLocal!: string;
  @IsOptional() @IsInt() verificationModeRaw?: number;
  @IsOptional() @IsInt() punchStateRaw?: number;
  @IsOptional() @IsInt() workCodeRaw?: number;
  @IsOptional() @IsString() @MaxLength(128) externalEventId?: string;
  @IsOptional() @IsString() @MaxLength(128) eventFingerprint?: string;
  @IsOptional() @IsString() @MaxLength(64) deviceTimezone?: string;
  @IsOptional() rawPayload?: Record<string, unknown>;
}

class IngestBatchDto {
  @IsUUID() integrationId!: string;
  @IsOptional() @IsUUID() deviceId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events!: IngestEventDto[];
}

/** Guards against an accidental unbounded upload. */
const MAX_EVENTS_PER_REQUEST = 5000;

/** A malformed timestamp is treated as absent rather than failing a heartbeat. */
function parseTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Controller('integrations/gateway')
export class GatewayServiceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: GatewayCredentialService,
    private readonly ingestion: RawAttendanceIngestionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Redeems a pairing code for a service credential.
   *
   * Unauthenticated by necessity — the gateway has no credential yet — so it is
   * rate limited by IP and the pairing code itself is attempt-capped.
   */
  @Post('pair')
  @HttpCode(200)
  @UseGuards(PublicRateLimitGuard)
  async pair(
    @Body() dto: GatewayPairDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    const result = await this.credentials.redeemPairingCode({
      plaintext: dto.pairingCode,
      gatewayVersion: dto.version ?? null,
      platform: dto.platform ?? null,
      architecture: dto.architecture ?? null,
      capabilities: dto.capabilities ?? null,
      ipAddress: request.ip ?? null,
    });

    await this.auditService.log({
      tenantId: result.tenantId,
      action: 'integrations.gateway_paired',
      entityType: 'IntegrationGateway',
      entityId: result.gatewayId,
      sourceModule: 'attendance-integrations',
      // Records that pairing happened. The code and the credential never appear.
      afterSnapshot: {
        credentialId: result.credential.credentialId,
        tokenPrefix: result.credential.tokenPrefix,
        version: dto.version ?? null,
        platform: dto.platform ?? null,
      },
    });

    return {
      gatewayId: result.gatewayId,
      // The only time this value is ever returned.
      credential: result.credential.plaintext,
      tokenPrefix: result.credential.tokenPrefix,
      message:
        'Store this credential securely. It cannot be retrieved again — a lost credential must be rotated.',
    };
  }

  /**
   * Liveness and operational metadata.
   *
   * The gateway reports facts about itself; the server decides status. A gateway
   * cannot declare itself ONLINE or write its own DB state.
   */
  @Post('heartbeat')
  @HttpCode(200)
  @UseGuards(GatewayAuthGuard)
  async heartbeat(
    @Body() dto: GatewayHeartbeatDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    const { tenantId, gatewayId } = request.gateway;
    const now = new Date();

    // Server-computed. The gateway reports facts about itself and may declare
    // that it knows it is unwell; it can never declare itself ONLINE.
    const status =
      (dto.devicesUnreachable ?? 0) > 0 || dto.degraded === true
        ? IntegrationGatewayStatus.DEGRADED
        : IntegrationGatewayStatus.ONLINE;

    const oldestPending = parseTimestamp(dto.oldestPendingEventAt);
    const lastUpload = parseTimestamp(dto.lastSuccessfulUploadAt);

    await this.prisma.integrationGateway.update({
      where: { id: gatewayId },
      data: {
        status,
        lastHeartbeatAt: now,
        lastIpAddress: request.ip ?? null,
        version: dto.version ?? undefined,
        platform: dto.platform ?? undefined,
        architecture: dto.architecture ?? undefined,
        installationId: dto.installationId ?? undefined,
        deviceCountOnline: dto.devicesOnline ?? undefined,
        deviceCountUnreachable: dto.devicesUnreachable ?? undefined,
        pendingQueueCount: dto.pendingQueueCount ?? undefined,
        // Explicitly nullable: an emptied queue has no oldest entry, and leaving
        // a stale timestamp would make a healthy gateway look permanently behind.
        oldestPendingEventAt: oldestPending,
        lastSuccessfulUploadAt: lastUpload ?? undefined,
        ...(dto.capabilities ? { capabilities: dto.capabilities } : {}),
      },
    });

    return {
      acknowledgedAt: now.toISOString(),
      status,
      tenantId,
      gatewayId,
      /** Authoritative server clock, so the gateway need not trust its own. */
      serverTimeUtc: now.toISOString(),
    };
  }

  /**
   * Raw attendance ingestion.
   *
   * The gateway names an integration and device; the server verifies both belong
   * to the credential's tenant and that the device belongs to that integration
   * and to this gateway. Nothing about tenancy is taken from the payload.
   */
  @Post('attendance/events')
  @HttpCode(200)
  @UseGuards(GatewayAuthGuard)
  async ingest(
    @Body() dto: IngestBatchDto,
    @Req() request: GatewayAuthenticatedRequest,
  ) {
    const { tenantId, gatewayId } = request.gateway;

    if (!Array.isArray(dto.events)) {
      throw new BadRequestException('events must be an array.');
    }
    if (dto.events.length > MAX_EVENTS_PER_REQUEST) {
      throw new BadRequestException(
        `A single request may carry at most ${MAX_EVENTS_PER_REQUEST} events.`,
      );
    }

    // The integration must belong to this tenant AND, where it is bound to a
    // gateway, to this gateway. Otherwise one tenant's gateway could feed
    // another integration it merely knows the id of.
    const integration = await this.prisma.attendanceIntegration.findFirst({
      where: { id: dto.integrationId, tenantId },
      select: { id: true, gatewayId: true, isActive: true },
    });

    if (!integration) {
      throw new ForbiddenException('Unknown attendance integration.');
    }
    if (integration.gatewayId && integration.gatewayId !== gatewayId) {
      throw new ForbiddenException(
        'This integration is served by a different gateway.',
      );
    }

    if (dto.deviceId) {
      const device = await this.prisma.attendanceDevice.findFirst({
        where: {
          id: dto.deviceId,
          tenantId,
          integrationId: integration.id,
        },
        select: { id: true, gatewayId: true },
      });

      if (!device) {
        throw new ForbiddenException('Unknown device for this integration.');
      }
      if (device.gatewayId && device.gatewayId !== gatewayId) {
        throw new ForbiddenException(
          'This device is served by a different gateway.',
        );
      }
    }

    const result = await this.ingestion.ingestBatch(
      {
        tenantId,
        integrationId: integration.id,
        deviceId: dto.deviceId ?? null,
        gatewayId,
      },
      dto.events,
    );

    // Counts only — never the stored rows.
    return {
      received: result.received,
      inserted: result.inserted,
      duplicates: result.duplicates,
      mapped: result.mapped,
      unmapped: result.unmapped,
      invalid: result.invalid,
      failed: result.failed,
      issues: result.issues,
    };
  }
}
