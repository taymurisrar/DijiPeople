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

/**
 * BUG-0669. This class existed with the right rules and was never referenced:
 * the handler took `Record<string, unknown>`, which gives the global
 * ValidationPipe no metadata to work from, so the endpoint accepted any body.
 *
 * `normalizePreferences` in the service is an allow-list of four keys, so
 * nothing unexpected was ever written — the exposure was the *values*: an
 * unbounded timezone, locale and date format persisted as sent, and an invalid
 * timezone reaching `new Intl.DateTimeFormat` and throwing a RangeError, which
 * surfaces as a 500 where a 400 is the honest answer.
 *
 * Declared and unwired is its own bug pattern here; the declaration reads as
 * cover and the behaviour is absent.
 */
export class UpdateMyPreferencesDto {
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
    @Body() dto: UpdateMyPreferencesDto,
  ) {
    return this.settingsContextService.updatePreferences(
      user,
      dto as unknown as Record<string, unknown>,
    );
  }
}
