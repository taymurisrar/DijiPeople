import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PERMISSION_KEYS } from '../../common/constants/permissions';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { SettingsContextService } from './settings-context.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsContextController {
  constructor(
    private readonly settingsContextService: SettingsContextService,
  ) {}

  @Get('resolved-context')
  @Permissions(PERMISSION_KEYS.TENANT_SETTINGS_RESOLVED_READ)
  @RequirePermission(ENTITY_KEYS.TENANT_SETTINGS_RESOLVED, 'read')
  async getResolvedContext(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('projectId') projectId?: string,
    @Query('module') module?: string,
    @Query('effectiveDate') effectiveDate?: string,
  ) {
    return this.settingsContextService.resolveForUser(user, {
      organizationId,
      businessUnitId,
      employeeId,
      projectId,
      module,
      effectiveDate,
    });
  }

  @Get('my-preferences')
  @Permissions(PERMISSION_KEYS.USER_PREFERENCES_READ)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  async getMyPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsContextService.getPreferences(user);
  }

  @Patch('my-preferences')
  @Permissions(PERMISSION_KEYS.USER_PREFERENCES_WRITE)
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'write')
  async updateMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.settingsContextService.updatePreferences(user, dto);
  }
}

class UpdateMyPreferencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  dateFormat?: string;

  @IsOptional()
  @Matches(/^(12h|24h)$/)
  timeFormat?: string;
}
