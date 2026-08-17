import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AttendanceDeviceDirectionMode,
  AttendanceDeviceScopeType,
  AttendanceDeviceStatus,
  AttendanceSyncIntervalUnit,
  AttendanceSyncMode,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AttendanceDeviceService } from './attendance-device.service';

const toBoolean = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : value === 'true' || value === true;

class ListDevicesDto {
  @IsOptional() @IsUUID() integrationId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsEnum(AttendanceDeviceStatus) status?: AttendanceDeviceStatus;
  @IsOptional() @Transform(toBoolean) @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}

class CreateDeviceDto {
  @IsUUID() integrationId!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(64) macAddress?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsString() @MaxLength(255) host?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsInt() @Min(0) @Max(255) machineNumber?: number;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional()
  @IsEnum(AttendanceDeviceDirectionMode)
  directionMode?: AttendanceDeviceDirectionMode;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

class UpdateDeviceDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(64) macAddress?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsString() @MaxLength(255) host?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsInt() @Min(0) @Max(255) machineNumber?: number;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional()
  @IsEnum(AttendanceDeviceDirectionMode)
  directionMode?: AttendanceDeviceDirectionMode;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

class DeviceStateDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

class UpsertSyncPolicyDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(AttendanceSyncMode) mode?: AttendanceSyncMode;
  @IsOptional() @IsInt() @Min(1) intervalValue?: number;
  @IsOptional()
  @IsEnum(AttendanceSyncIntervalUnit)
  intervalUnit?: AttendanceSyncIntervalUnit;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) activeWindowStart?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) activeWindowEnd?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) maxConcurrency?: number;
  @IsOptional() @IsInt() @Min(1) retryIntervalValue?: number;
  @IsOptional()
  @IsEnum(AttendanceSyncIntervalUnit)
  retryIntervalUnit?: AttendanceSyncIntervalUnit;
  @IsOptional() @IsInt() @Min(0) @Max(20) maxRetries?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3600) jitterSeconds?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Validates the interval against this connector's declared minimum. */
  @IsOptional() @IsString() @MaxLength(120) connectorType?: string;
}

class AddDeviceScopeDto {
  @IsEnum(AttendanceDeviceScopeType) scopeType!: AttendanceDeviceScopeType;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsUUID() businessUnitId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsBoolean() isAllowed?: boolean;
}

/**
 * Devices, sync policies and device scopes.
 *
 * Tenant always comes from the session. No route accepts a tenantId, and every
 * referenced relation is re-checked against that tenant in the service.
 */
@Controller('integrations/attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceDeviceController {
  constructor(private readonly service: AttendanceDeviceService) {}

  // --- devices -------------------------------------------------------------

  @Get('devices')
  @Permissions('attendanceDevices.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listDevices(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDevicesDto,
  ) {
    return this.service.listDevices(user.tenantId, query);
  }

  @Get('devices/:id')
  @Permissions('attendanceDevices.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  findDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findDevice(user.tenantId, id);
  }

  @Post('devices')
  @Permissions('attendanceDevices.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  createDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeviceDto,
  ) {
    return this.service.createDevice(user, dto);
  }

  @Patch('devices/:id')
  @Permissions('attendanceDevices.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  updateDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.service.updateDevice(user, id, dto);
  }

  @Post('devices/:id/enable')
  @Permissions('attendanceDevices.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  enableDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DeviceStateDto,
  ) {
    return this.service.setDeviceEnabled(user, id, true, dto.reason);
  }

  @Post('devices/:id/disable')
  @Permissions('attendanceDevices.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  disableDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DeviceStateDto,
  ) {
    return this.service.setDeviceEnabled(user, id, false, dto.reason);
  }

  /**
   * Asks the gateway serving this device to sync it at its next opportunity.
   *
   * Returns immediately with the recorded request. Nothing here contacts the
   * terminal: DijiPeople's servers have no route to a device on the customer's
   * LAN, and pretending otherwise would show a success the hardware never saw.
   */
  @Post('devices/:id/sync-now')
  @Permissions('attendanceDevices.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  requestSync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.requestDeviceSync(user, id);
  }

  // --- device scopes -------------------------------------------------------

  @Get('devices/:id/scopes')
  @Permissions('attendanceDevices.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listScopes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.listDeviceScopes(user.tenantId, id);
  }

  @Post('devices/:id/scopes')
  @Permissions('attendanceDevices.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  addScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddDeviceScopeDto,
  ) {
    return this.service.addDeviceScope(user, id, dto);
  }

  @Delete('devices/:id/scopes/:scopeId')
  @Permissions('attendanceDevices.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  removeScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('scopeId', new ParseUUIDPipe()) scopeId: string,
  ) {
    return this.service.removeDeviceScope(user, id, scopeId);
  }

  // --- sync policies -------------------------------------------------------

  @Get('sync-policies')
  @Permissions('integrations.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  listSyncPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listSyncPolicies(user.tenantId);
  }

  @Get('sync-policies/:id')
  @Permissions('integrations.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  findSyncPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findSyncPolicy(user.tenantId, id);
  }

  @Post('sync-policies')
  @Permissions('integrations.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  createSyncPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertSyncPolicyDto,
  ) {
    return this.service.upsertSyncPolicy(user, dto);
  }

  @Patch('sync-policies/:id')
  @Permissions('integrations.manage')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'manage')
  updateSyncPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertSyncPolicyDto,
  ) {
    return this.service.upsertSyncPolicy(user, { ...dto, id });
  }
}
