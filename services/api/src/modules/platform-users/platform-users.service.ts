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
import { ChangePlatformPasswordDto } from './dto/platform-password.dto';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
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

  /**
   * The signed-in platform user's own security posture.
   *
   * Read-only, and scoped to the actor — there is no `userId` parameter, so no
   * request can ask about somebody else's sessions.
   */
  async getSecurityOverview(actor: AuthenticatedUser) {
    this.assertPlatformUser(actor);
    const platformUserId = actor.platform!.id;

    const [user, sessions] = await Promise.all([
      this.prisma.platformUser.findUniqueOrThrow({
        where: { id: platformUserId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.platformRefreshToken.findMany({
        where: {
          platformUserId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { lastUsedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          sessionId: true,
          appClientId: true,
          createdAt: true,
          lastUsedAt: true,
          lastActivityAt: true,
          expiresAt: true,
          userAgent: true,
          ipAddress: true,
        },
      }),
    ]);

    const access = platformAccessForRole(user.role);

    return {
      account: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim() || user.email,
        role: user.role,
        status: user.status,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt,
      },
      /*
       * The role, and separately the aliases guards check for. Merging them is
       * how the Security page ended up listing one role four times.
       */
      access: {
        role: user.role,
        guardAliases: access.roleKeys,
        permissionKeys: access.permissionKeys,
        permissionCount: access.permissionKeys.length,
      },
      sessions: {
        activeCount: sessions.length,
        /*
         * The current session is marked rather than hidden, so "sign out
         * everywhere else" can say exactly what it will end.
         */
        items: sessions.map((session) => ({
          id: session.id,
          sessionId: session.sessionId,
          appClientId: session.appClientId,
          isCurrent: Boolean(
            actor.sessionId && session.sessionId === actor.sessionId,
          ),
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt ?? session.lastActivityAt,
          expiresAt: session.expiresAt,
          userAgent: session.userAgent,
          /* Truncated: enough to recognise a session, not to geolocate it. */
          ipAddress: session.ipAddress,
        })),
      },
    };
  }

  /**
   * Change the signed-in platform user's own password.
   *
   * Only ever the actor's own: there is no target-user parameter, so this cannot
   * become a way to take over another platform account. Resetting somebody
   * else's password is a separate, auditable administrative action.
   */
  async changeOwnPassword(
    actor: AuthenticatedUser,
    dto: ChangePlatformPasswordDto,
  ) {
    this.assertPlatformUser(actor);
    const platformUserId = actor.platform!.id;

    const user = await this.prisma.platformUser.findUniqueOrThrow({
      where: { id: platformUserId },
      select: { id: true, email: true, passwordHash: true, role: true },
    });

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) {
      /*
       * Recorded even though it failed. A run of these against a live admin
       * session is the signature of an unattended workstation or a stolen
       * cookie, and it is invisible if only successes are written.
       */
      await this.prisma.platformAuditLog.create({
        data: {
          platformActorUserId: platformUserId,
          action: 'PLATFORM_USER_PASSWORD_CHANGE_FAILED',
          entityType: 'PlatformUser',
          entityId: platformUserId,
          sourceModule: 'platform-users',
          afterSnapshot: { reason: 'CURRENT_PASSWORD_MISMATCH' },
        },
      });
      throw new BadRequestException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Your current password is not correct.',
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_UNCHANGED',
        message: 'The new password must be different from the current one.',
      });
    }

    /* Rejects a "new" password that is the current one under a different case. */
    const reusesExisting = await bcrypt.compare(
      dto.newPassword,
      user.passwordHash,
    );
    if (reusesExisting) {
      throw new BadRequestException({
        code: 'PASSWORD_UNCHANGED',
        message: 'The new password must be different from the current one.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const signOutOthers = dto.signOutOtherSessions !== false;

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await tx.platformUser.update({
        where: { id: platformUserId },
        data: { passwordHash, updatedById: platformUserId },
      });

      if (!signOutOthers) return 0;

      /*
       * Every other live session is revoked in the same transaction as the
       * password write. Doing it afterwards leaves a window in which the old
       * credential is gone but the sessions it created are still usable.
       *
       * The current session is kept so the person is not signed out of the page
       * they are standing on; `sessionId` comes from the verified token.
       */
      const result = await tx.platformRefreshToken.updateMany({
        where: {
          platformUserId,
          revokedAt: null,
          ...(actor.sessionId ? { NOT: { sessionId: actor.sessionId } } : {}),
        },
        data: { revokedAt: new Date() },
      });
      return result.count;
    });

    await this.prisma.platformAuditLog.create({
      data: {
        platformActorUserId: platformUserId,
        action: 'PLATFORM_USER_PASSWORD_CHANGED',
        entityType: 'PlatformUser',
        entityId: platformUserId,
        sourceModule: 'platform-users',
        /* No password material, current or new, in either snapshot. */
        afterSnapshot: {
          signedOutOtherSessions: signOutOthers,
          revokedSessions,
        },
      },
    });

    return {
      success: true,
      revokedSessions,
      message: signOutOthers
        ? `Password updated. ${revokedSessions} other session${
            revokedSessions === 1 ? '' : 's'
          } signed out.`
        : 'Password updated.',
    };
  }

  async getPreferences(actor: AuthenticatedUser) {
    this.assertPlatformUser(actor);
    const user = await this.prisma.platformUser.findUniqueOrThrow({
      where: { id: actor.platform!.id },
      select: {
        defaultDashboardView: true,
        uiTheme: true,
        uiDensity: true,
        defaultLandingRoute: true,
      },
    });
    /*
     * Nulls are resolved to the platform default on read rather than written on
     * create. Storing today's default would freeze every existing operator on
     * it the day the default changes, which is the difference between "has not
     * chosen" and "chose this".
     */
    return {
      defaultDashboardView: user.defaultDashboardView ?? 'ADMIN',
      uiTheme: user.uiTheme ?? 'SYSTEM',
      uiDensity: user.uiDensity ?? 'COMFORTABLE',
      defaultLandingRoute: user.defaultLandingRoute ?? '/',
    };
  }

  async updatePreferences(
    actor: AuthenticatedUser,
    dto: UpdatePlatformPreferencesDto,
  ) {
    this.assertPlatformUser(actor);
    /*
     * Only what the caller sent. Spreading the whole DTO would write undefined
     * over the preferences a different screen owns — the theme form does not
     * know about the dashboard view and must not clear it.
     */
    await this.prisma.platformUser.update({
      where: { id: actor.platform!.id },
      data: {
        ...(dto.defaultDashboardView !== undefined
          ? { defaultDashboardView: dto.defaultDashboardView }
          : {}),
        ...(dto.uiTheme !== undefined ? { uiTheme: dto.uiTheme } : {}),
        ...(dto.uiDensity !== undefined ? { uiDensity: dto.uiDensity } : {}),
        ...(dto.defaultLandingRoute !== undefined
          ? { defaultLandingRoute: dto.defaultLandingRoute }
          : {}),
      },
      select: { id: true },
    });
    return this.getPreferences(actor);
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
