import { ForbiddenException, Injectable } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  ENTITY_KEYS,
  SECURITY_ACCESS_LEVEL_WEIGHT,
} from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveEffectiveAccessLevel } from '../../common/security/rbac-query-scope';
import { ConfigurationResolverService } from './configuration-resolver.service';

type ResolveContextInput = {
  organizationId?: string;
  businessUnitId?: string;
  employeeId?: string;
  projectId?: string;
  module?: string;
  effectiveDate?: string;
};

@Injectable()
export class SettingsContextService {
  constructor(
    private readonly configurationResolver: ConfigurationResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async resolveForUser(user: AuthenticatedUser, input: ResolveContextInput) {
    const settingsAccess = resolveEffectiveAccessLevel(
      user,
      ENTITY_KEYS.SETTINGS,
      SecurityPrivilege.READ,
    );
    const mayResolveArbitrary =
      SECURITY_ACCESS_LEVEL_WEIGHT[settingsAccess] >=
      SECURITY_ACCESS_LEVEL_WEIGHT[SecurityAccessLevel.ORGANIZATION];
    const ownEmployee = await this.prisma.employee.findFirst({
      where: {
        tenantId: user.tenantId,
        userId: user.userId,
        isDeleted: false,
        deletedAt: null,
      },
      select: {
        id: true,
        businessUnitId: true,
        businessUnit: { select: { organizationId: true } },
      },
    });

    if (mayResolveArbitrary) {
      await this.assertRequestedContextScope(user, settingsAccess, input);
    }

    return this.configurationResolver.resolveAppContext({
      tenantId: user.tenantId,
      organizationId: mayResolveArbitrary
        ? input.organizationId
        : ownEmployee?.businessUnit?.organizationId,
      businessUnitId: mayResolveArbitrary
        ? input.businessUnitId
        : ownEmployee?.businessUnitId,
      employeeId: mayResolveArbitrary ? input.employeeId : ownEmployee?.id,
      projectId: mayResolveArbitrary ? input.projectId : undefined,
      module: input.module,
      effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
    });
  }

  async getPreferences(user: AuthenticatedUser) {
    const account = await this.prisma.user.findFirst({
      where: { tenantId: user.tenantId, id: user.userId },
      select: { preferencesJson: true },
    });
    return account?.preferencesJson ?? {};
  }

  async updatePreferences(
    user: AuthenticatedUser,
    dto: Record<string, unknown>,
  ) {
    const account = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!account) return {};
    const updatedAccount = await this.prisma.user.update({
      where: { id: account.id },
      data: {
        preferencesJson: normalizePreferences(dto),
        updatedById: user.userId,
      },
      select: { preferencesJson: true },
    });
    return updatedAccount.preferencesJson ?? {};
  }

  private async assertRequestedContextScope(
    user: AuthenticatedUser,
    accessLevel: SecurityAccessLevel,
    input: ResolveContextInput,
  ) {
    const records = await Promise.all([
      input.organizationId
        ? this.prisma.organization.findFirst({
            where: { tenantId: user.tenantId, id: input.organizationId },
            select: { id: true },
          })
        : null,
      input.businessUnitId
        ? this.prisma.businessUnit.findFirst({
            where: { tenantId: user.tenantId, id: input.businessUnitId },
            select: { organizationId: true },
          })
        : null,
      input.employeeId
        ? this.prisma.employee.findFirst({
            where: {
              tenantId: user.tenantId,
              id: input.employeeId,
              isDeleted: false,
            },
            select: {
              businessUnit: { select: { organizationId: true } },
            },
          })
        : null,
      input.projectId
        ? this.prisma.project.findFirst({
            where: { tenantId: user.tenantId, id: input.projectId },
            select: { organizationId: true },
          })
        : null,
    ]);

    const requested = [
      input.organizationId
        ? { found: records[0], organizationId: records[0]?.id }
        : null,
      input.businessUnitId
        ? { found: records[1], organizationId: records[1]?.organizationId }
        : null,
      input.employeeId
        ? {
            found: records[2],
            organizationId: records[2]?.businessUnit?.organizationId,
          }
        : null,
      input.projectId
        ? { found: records[3], organizationId: records[3]?.organizationId }
        : null,
    ].filter(Boolean) as Array<{
      found: unknown;
      organizationId?: string | null;
    }>;

    const denied = requested.some(
      (record) =>
        !record.found ||
        (accessLevel !== SecurityAccessLevel.TENANT &&
          record.organizationId !== user.accessContext?.organizationId),
    );

    if (denied) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to resolve this context.',
      });
    }
  }
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
  if (timeFormat && /^(12h|24h)$/.test(timeFormat)) {
    preferences.timeFormat = timeFormat;
  }
  return preferences;
}
