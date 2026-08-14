import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  DeviceProvisioningStatus,
  ExternalUserMappingStatus,
  IntegrationRunStatus,
  IntegrationRunType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { AttendanceOperationsService } from './attendance-operations.service';

class AssignWorkSiteDto {
  @IsUUID() locationId!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}

class SetPrimaryWorkSiteDto {
  @IsUUID() locationId!: string;
}

class ListExternalUsersDto {
  @IsOptional() @IsUUID() integrationId?: string;
  @IsOptional() @IsUUID() deviceId?: string;
  @IsOptional()
  @IsEnum(ExternalUserMappingStatus)
  mappingStatus?: ExternalUserMappingStatus;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class ConfirmMappingDto {
  @IsUUID() employeeId!: string;
}

class ListRunsDto {
  @IsOptional() @IsUUID() integrationId?: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsUUID() deviceId?: string;
  @IsOptional() @IsEnum(IntegrationRunType) runType?: IntegrationRunType;
  @IsOptional() @IsEnum(IntegrationRunStatus) status?: IntegrationRunStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class ListProvisioningJobsDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() deviceId?: string;
  @IsOptional()
  @IsEnum(DeviceProvisioningStatus)
  status?: DeviceProvisioningStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

@Controller('integrations/attendance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceOperationsController {
  constructor(private readonly service: AttendanceOperationsService) {}

  // --- employee work sites -------------------------------------------------

  @Get('employees/:employeeId/work-sites')
  @Permissions('attendanceDevices.read')
  listWorkSites(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.service.listEmployeeWorkSites(user.tenantId, employeeId);
  }

  @Post('employees/:employeeId/work-sites')
  @Permissions('attendanceDevices.manage')
  assignWorkSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: AssignWorkSiteDto,
  ) {
    return this.service.assignWorkSite(user, employeeId, dto);
  }

  @Post('employees/:employeeId/work-sites/primary')
  @Permissions('attendanceDevices.manage')
  setPrimaryWorkSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: SetPrimaryWorkSiteDto,
  ) {
    return this.service.setPrimaryWorkSite(user, employeeId, dto.locationId);
  }

  @Delete('employees/:employeeId/work-sites/:locationId')
  @Permissions('attendanceDevices.manage')
  removeWorkSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
  ) {
    return this.service.removeWorkSite(user, employeeId, locationId);
  }

  // --- external device users and mapping -----------------------------------

  @Get('external-users')
  @Permissions('attendanceMappings.read')
  listExternalUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListExternalUsersDto,
  ) {
    return this.service.listExternalUsers(user.tenantId, query);
  }

  @Get('external-users/:id')
  @Permissions('attendanceMappings.read')
  findExternalUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findExternalUser(user.tenantId, id);
  }

  /** Read-only identity trail. Superseded mappings are never removed. */
  @Get('external-users/:id/history')
  @Permissions('attendanceMappings.read')
  mappingHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.listMappingHistory(user.tenantId, id);
  }

  /** Suggestions only — nothing is mapped by calling this. */
  @Get('external-users/:id/suggestions')
  @Permissions('attendanceMappings.read')
  suggestMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.suggestMapping(user.tenantId, id);
  }

  /** Also used to change an existing mapping; history is superseded, not deleted. */
  @Post('external-users/:id/map')
  @Permissions('attendanceMappings.manage')
  confirmMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmMappingDto,
  ) {
    return this.service.confirmMapping(user, id, dto.employeeId);
  }

  @Post('external-users/:id/ignore')
  @Permissions('attendanceMappings.manage')
  ignore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.ignoreMapping(user, id, true);
  }

  @Post('external-users/:id/unignore')
  @Permissions('attendanceMappings.manage')
  unignore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.ignoreMapping(user, id, false);
  }

  // --- integration runs ----------------------------------------------------

  @Get('runs')
  @Permissions('integrations.read')
  listRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRunsDto,
  ) {
    return this.service.listRuns(user.tenantId, query);
  }

  @Get('runs/:id')
  @Permissions('integrations.read')
  findRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findRun(user.tenantId, id);
  }

  // --- provisioning jobs ---------------------------------------------------

  @Get('provisioning-jobs')
  @Permissions('attendanceProvisioning.read')
  listProvisioningJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProvisioningJobsDto,
  ) {
    return this.service.listProvisioningJobs(user.tenantId, query);
  }

  @Get('provisioning-jobs/:id')
  @Permissions('attendanceProvisioning.read')
  findProvisioningJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findProvisioningJob(user.tenantId, id);
  }

  /** Requeues only. No device is contacted synchronously. */
  @Post('provisioning-jobs/:id/retry')
  @Permissions('attendanceProvisioning.manage')
  retryProvisioningJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.retryProvisioningJob(user, id);
  }

  @Post('provisioning-jobs/:id/cancel')
  @Permissions('attendanceProvisioning.manage')
  cancelProvisioningJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.cancelProvisioningJob(user, id);
  }
}
