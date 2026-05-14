import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ConfigurationResolverService } from './configuration-resolver.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsContextController {
  constructor(
    private readonly configurationResolver: ConfigurationResolverService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('resolved-context')
  @Permissions('dashboard.view')
  getResolvedContext(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('projectId') projectId?: string,
    @Query('module') module?: string,
    @Query('effectiveDate') effectiveDate?: string,
  ) {
    return this.configurationResolver.resolveAppContext({
      tenantId: user.tenantId,
      organizationId,
      businessUnitId,
      employeeId,
      projectId,
      module,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
    });
  }

  @Get('my-preferences')
  @Permissions('dashboard.view')
  async getMyPreferences(@CurrentUser() user: AuthenticatedUser) {
    const account = await this.prisma.user.findFirst({
      where: { tenantId: user.tenantId, id: user.userId },
      select: { preferencesJson: true },
    });

    return account?.preferencesJson ?? {};
  }

  @Patch('my-preferences')
  @Permissions('dashboard.view')
  async updateMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Record<string, unknown>,
  ) {
    const nextPreferences = normalizePreferences(dto);
    const account = await this.prisma.user.update({
      where: { id: user.userId },
      data: {
        preferencesJson: nextPreferences,
        updatedById: user.userId,
      },
      select: { preferencesJson: true },
    });

    return account.preferencesJson ?? {};
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

function normalizePreferences(dto: Record<string, unknown>) {
  const preferences: Record<string, string> = {};

  const timezone = typeof dto.timezone === 'string' ? dto.timezone.trim() : '';
  const locale = typeof dto.locale === 'string' ? dto.locale.trim() : '';
  const dateFormat =
    typeof dto.dateFormat === 'string' ? dto.dateFormat.trim() : '';
  const timeFormat =
    typeof dto.timeFormat === 'string' ? dto.timeFormat.trim() : '';

  if (timezone) {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    preferences.timezone = timezone;
  }

  if (locale) preferences.locale = locale;
  if (dateFormat) preferences.dateFormat = dateFormat;
  if (timeFormat && /^(12h|24h)$/.test(timeFormat))
    preferences.timeFormat = timeFormat;

  return preferences;
}
