import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto';
import { UpdatePlatformPreferencesDto } from './dto/platform-preferences.dto';
import { UpdatePlatformModulePreferenceDto } from './dto/platform-module-preference.dto';
import { resolveRuntimeField } from '@repo/config';

@Injectable()
export class PlatformUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser) {
    this.assertCanManage(actor);

    const users = await this.prisma.platformUser.findMany({
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }

  async listOwnerCandidates(actor: AuthenticatedUser) {
    this.assertPlatformUser(actor);

    const users = await this.prisma.platformUser.findMany({
      where: {
        status: PlatformUserStatus.ACTIVE,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`.trim() || user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
    }));
  }

  async create(actor: AuthenticatedUser, dto: CreatePlatformUserDto) {
    this.assertCanManage(actor);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.platformUser.create({
      data: {
        email: normalizeEmail(dto.email),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        passwordHash,
        role: dto.role,
        status: dto.status ?? PlatformUserStatus.ACTIVE,
        createdById: actor.platform?.id,
        updatedById: actor.platform?.id,
      },
    });

    await this.prisma.platformAuditLog.create({
      data: {
        platformActorUserId: actor.platform?.id,
        action: 'PLATFORM_USER_CREATED',
        entityType: 'PlatformUser',
        entityId: user.id,
        sourceModule: 'platform-users',
        afterSnapshot: {
          email: user.email,
          role: user.role,
          status: user.status,
        },
      },
    });

    return { userId: user.id, id: user.id };
  }

  async getPreferences(actor: AuthenticatedUser) {
    this.assertPlatformUser(actor);
    const user = await this.prisma.platformUser.findUniqueOrThrow({
      where: { id: actor.platform!.id },
      select: { defaultDashboardView: true },
    });
    return { defaultDashboardView: user.defaultDashboardView ?? 'ADMIN' };
  }

  async updatePreferences(
    actor: AuthenticatedUser,
    dto: UpdatePlatformPreferencesDto,
  ) {
    this.assertPlatformUser(actor);
    const updated = await this.prisma.platformUser.update({
      where: { id: actor.platform!.id },
      data: { defaultDashboardView: dto.defaultDashboardView },
      select: { defaultDashboardView: true },
    });
    return updated;
  }

  async getModulePreference(actor: AuthenticatedUser, moduleKey: string) {
    this.assertPlatformUser(actor);
    const preference = await this.prisma.platformModulePreference.findUnique({
      where: {
        platformUserId_moduleKey: {
          platformUserId: actor.platform!.id,
          moduleKey,
        },
      },
    });
    if (preference) {
      const tableStateJson = repairRuntimeTableState(
        moduleKey,
        preference.tableStateJson,
      );
      return { ...preference, tableStateJson };
    }
    return {
      moduleKey,
      defaultViewKey: null,
      selectedViewKey: null,
      tableStateJson: null,
      dashboardLayoutJson: null,
    };
  }

  async updateModulePreference(
    actor: AuthenticatedUser,
    dto: UpdatePlatformModulePreferenceDto,
  ) {
    this.assertPlatformUser(actor);
    return this.prisma.platformModulePreference.upsert({
      where: {
        platformUserId_moduleKey: {
          platformUserId: actor.platform!.id,
          moduleKey: dto.moduleKey,
        },
      },
      create: {
        platformUserId: actor.platform!.id,
        moduleKey: dto.moduleKey,
        defaultViewKey: dto.defaultViewKey ?? null,
        selectedViewKey: dto.selectedViewKey ?? null,
        tableStateJson: repairRuntimeTableState(
          dto.moduleKey,
          dto.tableStateJson,
        ) as never,
        dashboardLayoutJson: dto.dashboardLayoutJson as never,
      },
      update: {
        ...(dto.defaultViewKey !== undefined
          ? { defaultViewKey: dto.defaultViewKey }
          : {}),
        ...(dto.selectedViewKey !== undefined
          ? { selectedViewKey: dto.selectedViewKey }
          : {}),
        ...(dto.tableStateJson !== undefined
          ? {
              tableStateJson: repairRuntimeTableState(
                dto.moduleKey,
                dto.tableStateJson,
              ) as never,
            }
          : {}),
        ...(dto.dashboardLayoutJson !== undefined
          ? { dashboardLayoutJson: dto.dashboardLayoutJson as never }
          : {}),
      },
    });
  }

  async update(
    actor: AuthenticatedUser,
    userId: string,
    dto: UpdatePlatformUserDto,
  ) {
    this.assertCanManage(actor);

    const existing = await this.prisma.platformUser.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new NotFoundException('Platform user was not found.');
    }

    await this.assertSuperAdminInvariant(actor, existing.id, dto);

    const updated = await this.prisma.platformUser.update({
      where: { id: userId },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        updatedById: actor.platform?.id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastActiveAt: true,
      },
    });
    await this.prisma.platformAuditLog.create({
      data: {
        platformActorUserId: actor.platform?.id,
        action: 'PLATFORM_USER_ACCESS_UPDATED',
        entityType: 'PlatformUser',
        entityId: userId,
        sourceModule: 'platform-users',
        beforeSnapshot: { role: existing.role, status: existing.status },
        afterSnapshot: { role: updated.role, status: updated.status },
      },
    });
    return updated;
  }

  async disable(actor: AuthenticatedUser, userId: string) {
    this.assertCanManage(actor);

    const existing = await this.prisma.platformUser.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new NotFoundException('Platform user was not found.');
    }

    if (actor.platform?.id === userId) {
      throw new ForbiddenException('You cannot disable your own account.');
    }

    await this.assertSuperAdminInvariant(actor, existing.id, {
      status: PlatformUserStatus.DISABLED,
    });

    await this.prisma.platformRefreshToken.updateMany({
      where: { platformUserId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const disabled = await this.prisma.platformUser.update({
      where: { id: userId },
      data: {
        status: PlatformUserStatus.DISABLED,
        updatedById: actor.platform?.id,
      },
      select: { id: true, status: true },
    });
    await this.prisma.platformAuditLog.create({
      data: {
        platformActorUserId: actor.platform?.id,
        action: 'PLATFORM_USER_DISABLED',
        entityType: 'PlatformUser',
        entityId: userId,
        sourceModule: 'platform-users',
        beforeSnapshot: { role: existing.role, status: existing.status },
        afterSnapshot: { role: existing.role, status: disabled.status },
      },
    });
    return disabled;
  }

  private assertCanManage(actor: AuthenticatedUser) {
    this.assertPlatformUser(actor);
    if (
      actor.platform?.role !== PlatformUserRole.SUPER_ADMIN &&
      actor.platform?.role !== PlatformUserRole.PLATFORM_OWNER
    ) {
      throw new ForbiddenException(
        'Only platform Super Admins can manage platform users.',
      );
    }
  }

  private assertPlatformUser(actor: AuthenticatedUser) {
    if (
      !actor.platform?.id ||
      actor.platform.status !== PlatformUserStatus.ACTIVE
    ) {
      throw new ForbiddenException('Platform user access is required.');
    }
  }

  private async assertSuperAdminInvariant(
    actor: AuthenticatedUser,
    userId: string,
    dto: Pick<UpdatePlatformUserDto, 'role' | 'status'>,
  ) {
    if (
      actor.platform?.id === userId &&
      dto.status === PlatformUserStatus.DISABLED
    ) {
      throw new ForbiddenException('You cannot disable your own account.');
    }

    const target = await this.prisma.platformUser.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });

    const wouldRemoveSuperAdmin =
      (dto.role !== undefined && dto.role !== PlatformUserRole.SUPER_ADMIN) ||
      dto.status === PlatformUserStatus.DISABLED;

    if (!wouldRemoveSuperAdmin) return;

    if (
      target?.role !== PlatformUserRole.SUPER_ADMIN ||
      target.status !== PlatformUserStatus.ACTIVE
    ) {
      return;
    }

    const activeSuperAdminCount = await this.prisma.platformUser.count({
      where: {
        role: PlatformUserRole.SUPER_ADMIN,
        status: PlatformUserStatus.ACTIVE,
      },
    });

    if (activeSuperAdminCount <= 1) {
      throw new BadRequestException(
        'At least one active platform Super Admin is required.',
      );
    }
  }
}

const RUNTIME_PREFERENCE_VERSION = 2;

export function repairRuntimeTableState(moduleKey: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (state.version !== RUNTIME_PREFERENCE_VERSION) return null;
  const savedFilters = Array.isArray(state.savedFilters)
    ? state.savedFilters
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const filter = item as Record<string, unknown>;
          const filters = Array.isArray(filter.filters)
            ? filter.filters.filter((candidate) => {
                if (!candidate || typeof candidate !== 'object') return false;
                const field = (candidate as Record<string, unknown>).field;
                return (
                  typeof field === 'string' &&
                  Boolean(resolveRuntimeField(moduleKey, field)?.filterable)
                );
              })
            : [];
          return { ...filter, filters };
        })
    : [];
  return {
    version: RUNTIME_PREFERENCE_VERSION,
    visibleColumns: Array.isArray(state.visibleColumns)
      ? state.visibleColumns.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    columnOrder: Array.isArray(state.columnOrder)
      ? state.columnOrder.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    columnWidths:
      state.columnWidths && typeof state.columnWidths === 'object'
        ? state.columnWidths
        : {},
    savedFilters,
  };
}
