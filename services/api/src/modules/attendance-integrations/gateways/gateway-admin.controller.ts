import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IntegrationGatewayStatus, Prisma } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { GatewayCredentialService } from './gateway-credential.service';

class ListGatewaysDto {
  @IsOptional()
  @IsEnum(IntegrationGatewayStatus)
  status?: IntegrationGatewayStatus;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class CreateGatewayDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

class UpdateGatewayDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

class RevokeGatewayDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

/**
 * Tenant-facing gateway administration.
 *
 * A gateway is considered OFFLINE when it has not been heard from for longer
 * than this, computed on read rather than written by a scheduler — Phase 1 has
 * no background job, and a status that silently goes stale would be worse than
 * one derived on demand.
 */
const OFFLINE_AFTER_MS = 5 * 60_000;

@Controller('integrations/gateways')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GatewayAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: GatewayCredentialService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions('gateways.read')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListGatewaysDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.IntegrationGatewayWhereInput = {
      tenantId: user.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.integrationGateway.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { integrations: true, devices: true } } },
      }),
      this.prisma.integrationGateway.count({ where }),
    ]);

    return {
      items: items.map((gateway) => this.toResponse(gateway)),
      page,
      pageSize,
      total,
    };
  }

  @Get(':id')
  @Permissions('gateways.read')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const gateway = await this.prisma.integrationGateway.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { _count: { select: { integrations: true, devices: true } } },
    });
    if (!gateway) {
      throw new NotFoundException('Gateway could not be found.');
    }

    // Credential metadata only — never a secret or a hash.
    const credentials = await this.prisma.integrationGatewayCredential.findMany(
      {
        where: { tenantId: user.tenantId, gatewayId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tokenPrefix: true,
          label: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
        },
      },
    );

    return { ...this.toResponse(gateway), credentials };
  }

  @Post()
  @Permissions('gateways.manage')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGatewayDto,
  ) {
    const gateway = await this.prisma.integrationGateway.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        description: dto.description?.trim() || null,
        status: IntegrationGatewayStatus.PENDING,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.gateway_created',
      entityType: 'IntegrationGateway',
      entityId: gateway.id,
      sourceModule: 'attendance-integrations',
      afterSnapshot: { name: gateway.name, status: gateway.status },
    });

    return this.toResponse({
      ...gateway,
      _count: { integrations: 0, devices: 0 },
    });
  }

  @Patch(':id')
  @Permissions('gateways.manage')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateGatewayDto,
  ) {
    const existing = await this.prisma.integrationGateway.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException('Gateway could not be found.');
    }

    const updated = await this.prisma.integrationGateway.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        updatedById: user.userId,
      },
      include: { _count: { select: { integrations: true, devices: true } } },
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.gateway_updated',
      entityType: 'IntegrationGateway',
      entityId: id,
      sourceModule: 'attendance-integrations',
      beforeSnapshot: { name: existing.name },
      afterSnapshot: { name: updated.name },
    });

    return this.toResponse(updated);
  }

  /**
   * Issues a pairing code. The plaintext is in the response and nowhere else —
   * not in the database, not in the audit trail, not in the logs.
   */
  @Post(':id/pairing-code')
  @Permissions('gateways.manage')
  async issuePairingCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const issued = await this.credentials.issuePairingCode({
      tenantId: user.tenantId,
      gatewayId: id,
      actorUserId: user.userId,
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.gateway_pairing_code_generated',
      entityType: 'IntegrationGateway',
      entityId: id,
      sourceModule: 'attendance-integrations',
      // Hint and expiry only. The code itself is never recorded.
      afterSnapshot: {
        pairingCodeId: issued.pairingCodeId,
        codeHint: issued.codeHint,
        expiresAt: issued.expiresAt,
      },
    });

    return {
      pairingCode: issued.plaintext,
      expiresAt: issued.expiresAt,
      message:
        'Enter this code in the gateway installer. It can be used once and expires shortly.',
    };
  }

  @Post(':id/rotate-credential')
  @Permissions('gateways.manage')
  async rotateCredential(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const credential = await this.credentials.rotateCredential({
      tenantId: user.tenantId,
      gatewayId: id,
      actorUserId: user.userId,
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.gateway_credential_rotated',
      entityType: 'IntegrationGateway',
      entityId: id,
      sourceModule: 'attendance-integrations',
      afterSnapshot: {
        credentialId: credential.credentialId,
        tokenPrefix: credential.tokenPrefix,
      },
    });

    return {
      credential: credential.plaintext,
      tokenPrefix: credential.tokenPrefix,
      message:
        'The previous credential keeps working until you revoke it, so the gateway can be switched over without downtime.',
    };
  }

  @Post(':id/revoke')
  @Permissions('gateways.manage')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevokeGatewayDto,
  ) {
    const result = await this.credentials.revokeGateway({
      tenantId: user.tenantId,
      gatewayId: id,
      reason: dto.reason ?? null,
      actorUserId: user.userId,
    });

    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'integrations.gateway_revoked',
      entityType: 'IntegrationGateway',
      entityId: id,
      sourceModule: 'attendance-integrations',
      afterSnapshot: {
        reason: dto.reason ?? null,
        revokedCredentials: result.revokedCredentials,
      },
    });

    return { revoked: true, ...result };
  }

  private toResponse(gateway: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    status: IntegrationGatewayStatus;
    version: string | null;
    platform: string | null;
    architecture: string | null;
    lastHeartbeatAt: Date | null;
    registeredAt: Date | null;
    revokedAt: Date | null;
    _count?: { integrations: number; devices: number };
  }) {
    return {
      id: gateway.id,
      name: gateway.name,
      code: gateway.code,
      description: gateway.description,
      status: this.effectiveStatus(gateway),
      recordedStatus: gateway.status,
      version: gateway.version,
      platform: gateway.platform,
      architecture: gateway.architecture,
      lastHeartbeatAt: gateway.lastHeartbeatAt,
      registeredAt: gateway.registeredAt,
      revokedAt: gateway.revokedAt,
      integrationCount: gateway._count?.integrations ?? 0,
      deviceCount: gateway._count?.devices ?? 0,
      isPaired: gateway.registeredAt !== null && gateway.revokedAt === null,
    };
  }

  /** ONLINE decays to OFFLINE once heartbeats stop, without a background job. */
  private effectiveStatus(gateway: {
    status: IntegrationGatewayStatus;
    lastHeartbeatAt: Date | null;
    revokedAt: Date | null;
  }): IntegrationGatewayStatus {
    if (gateway.revokedAt) return IntegrationGatewayStatus.REVOKED;
    if (gateway.status === IntegrationGatewayStatus.PENDING) {
      return IntegrationGatewayStatus.PENDING;
    }
    if (
      !gateway.lastHeartbeatAt ||
      Date.now() - gateway.lastHeartbeatAt.getTime() > OFFLINE_AFTER_MS
    ) {
      return IntegrationGatewayStatus.OFFLINE;
    }
    return gateway.status;
  }
}
