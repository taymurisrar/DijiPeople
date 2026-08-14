import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttendanceIntegrationStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AttendanceIntegrationService } from './attendance-integration.service';

class ListIntegrationsDto {
  @IsOptional()
  @IsEnum(AttendanceIntegrationStatus)
  status?: AttendanceIntegrationStatus;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}

class CreateIntegrationDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsString() @MaxLength(120) connectorType!: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsUUID() syncPolicyId?: string;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

class UpdateIntegrationDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsUUID() syncPolicyId?: string;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

class DisableIntegrationDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

/**
 * Tenant-facing integration management.
 *
 * Note what is absent: there is no route that sets `status` directly. Lifecycle
 * moves only through the named transitions below, each of which checks its own
 * preconditions. A browser cannot mark an integration ACTIVE by PATCHing a field.
 *
 * Tenant comes from the authenticated session on every call; no route accepts a
 * tenantId parameter.
 */
@Controller('integrations/attendance/integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceIntegrationController {
  constructor(private readonly service: AttendanceIntegrationService) {}

  @Get()
  @Permissions('integrations.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListIntegrationsDto,
  ) {
    return this.service.list(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('integrations.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findOne(user.tenantId, id);
  }

  @Post()
  @Permissions('integrations.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIntegrationDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Permissions('integrations.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    return this.service.update(user, id, dto);
  }

  /** Schema validation. Does not contact hardware — see the service docs. */
  @Post(':id/validate-configuration')
  @Permissions('integrations.manage')
  validateConfiguration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.validateConfiguration(user, id);
  }

  @Get(':id/readiness')
  @Permissions('integrations.read')
  readiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.evaluateReadiness(user.tenantId, id);
  }

  @Post(':id/activate')
  @Permissions('integrations.manage')
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.activate(user, id);
  }

  @Post(':id/disable')
  @Permissions('integrations.manage')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DisableIntegrationDto,
  ) {
    return this.service.disable(user, id, dto.reason);
  }
}
