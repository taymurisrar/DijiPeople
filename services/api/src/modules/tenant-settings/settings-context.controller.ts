import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  async getResolvedContext(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('projectId') projectId?: string,
    @Query('module') module?: string,
    @Query('effectiveDate') effectiveDate?: string,
  ) {
    const canResolveArbitraryContext =
      user.permissionKeys.includes('dashboard.view');
    const ownEmployee = canResolveArbitraryContext
      ? null
      : await this.prisma.employee.findFirst({
          where: {
            tenantId: user.tenantId,
            userId: user.userId,
            isDeleted: false,
            deletedAt: null,
          },
          select: {
            id: true,
            businessUnitId: true,
            businessUnit: {
              select: {
                organizationId: true,
              },
            },
          },
        });

    // Self-service callers only receive their own effective app context.
    // Callers with dashboard access retain the existing context-resolution surface.
    return this.configurationResolver.resolveAppContext({
      tenantId: user.tenantId,
      organizationId: canResolveArbitraryContext
        ? organizationId
        : ownEmployee?.businessUnit?.organizationId,
      businessUnitId: canResolveArbitraryContext
        ? businessUnitId
        : ownEmployee?.businessUnitId,
      employeeId: canResolveArbitraryContext
        ? employeeId
        : ownEmployee?.id,
      projectId: canResolveArbitraryContext ? projectId : undefined,
      module,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
    });
  }

  @Get('my-preferences')
  async getMyPreferences(@CurrentUser() user: AuthenticatedUser) {
    const account = await this.prisma.user.findFirst({
      where: { tenantId: user.tenantId, id: user.userId },
      select: { preferencesJson: true },
    });

    return account?.preferencesJson ?? {};
  }

  @Patch('my-preferences')
  async updateMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Record<string, unknown>,
  ) {
    const nextPreferences = normalizePreferences(dto);
    const account = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!account) {
      return {};
    }

    const updatedAccount = await this.prisma.user.update({
      where: { id: account.id },
      data: {
        preferencesJson: nextPreferences,
        updatedById: user.userId,
      },
      select: { preferencesJson: true },
    });

    return updatedAccount.preferencesJson ?? {};
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
