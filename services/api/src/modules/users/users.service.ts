import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SecurityPrivilege, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import {
  ENTITY_KEYS,
  ROLE_KEYS,
  SECURITY_ACCESS_LEVEL_WEIGHT,
} from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { normalizeEmail } from '../../common/utils/email.util';
import { AuditService } from '../audit/audit.service';
import { ActiveOrganizationService } from '../tenant-settings/active-organization.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesRepository } from '../roles/roles.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { LinkUserEmployeeDto } from './dto/link-user-employee.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    private readonly activeOrganizationService: ActiveOrganizationService,
  ) {}

  findByTenant(tenantId: string, currentUser?: AuthenticatedUser) {
    const accessWhere = currentUser
      ? buildScopedAccessWhere<Prisma.UserWhereInput>(
          currentUser,
          ENTITY_KEYS.USERS,
          SecurityPrivilege.READ,
          {
            organizationIdField: null,
            userIdField: 'id',
          },
        )
      : {};

    return this.usersRepository
      .findByTenant(tenantId, accessWhere)
      .then((users) => users.map((user) => this.mapUserSummary(user)));
  }

  findByTenantSlugAndEmail(tenantSlug: string, email: string) {
    return this.usersRepository.findByTenantSlugAndEmail(tenantSlug, email);
  }

  findByTenantIdAndEmail(tenantId: string, email: string) {
    return this.usersRepository.findByTenantIdAndEmail(tenantId, email);
  }

  findByEmailWithAccess(email: string) {
    return this.usersRepository.findByEmailWithAccess(email);
  }

  findManyByEmailWithAccess(email: string) {
    return this.usersRepository.findManyByEmailWithAccess(email);
  }

  findByIdWithAccess(id: string) {
    return this.usersRepository.findByIdWithAccess(id);
  }

  async findCurrentProfile(tenantId: string, userId: string) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException(
        'User profile was not found for this tenant.',
      );
    }

    return this.mapUserSummary(user);
  }

  async create(tenantId: string, dto: CreateUserDto, actorId: string) {
    const normalizedEmail = normalizeEmail(dto.email);
    const existingUser = await this.usersRepository.findByTenantIdAndEmail(
      tenantId,
      normalizedEmail,
    );

    if (existingUser) {
      throw new ConflictException('Email is already in use.');
    }

    const employee = dto.employeeId
      ? await this.usersRepository.findEmployeeForLinking(
          tenantId,
          dto.employeeId,
        )
      : null;
    if (dto.employeeId && !employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }
    if (employee?.userId) {
      throw new ConflictException(
        'This employee is already linked to another user.',
      );
    }

    const password = dto.password ?? randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 12);
    const actor = await this.findByIdWithAccess(actorId);
    const fallbackBusinessUnitId =
      actor && actor.tenantId === tenantId ? actor.businessUnitId : undefined;

    const user = await this.usersRepository.create({
      tenantId,
      ...((dto.businessUnitId ?? fallbackBusinessUnitId)
        ? { businessUnitId: dto.businessUnitId ?? fallbackBusinessUnitId }
        : {}),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: normalizedEmail,
      passwordHash,
      status:
        dto.status ?? (dto.password ? UserStatus.ACTIVE : UserStatus.INVITED),
      isServiceAccount:
        dto.accountType === 'SERVICE_ACCOUNT'
          ? true
          : (dto.isServiceAccount ?? false),
      preferencesJson: this.buildPreferencesJson(dto),
      createdById: actorId,
      updatedById: actorId,
    });
    if (employee) {
      const linkResult = await this.usersRepository.linkEmployee(
        tenantId,
        user.id,
        employee.id,
        actorId,
      );
      if (linkResult.count === 0) {
        throw new ConflictException(
          'This employee could not be linked because the link changed. Refresh and try again.',
        );
      }
    }

    const createdUser = await this.usersRepository.findByIdWithAccess(user.id);

    if (!createdUser || createdUser.tenantId !== tenantId) {
      throw new NotFoundException('Created user could not be loaded.');
    }

    const createdSummary = this.mapUserSummary(createdUser);

    await this.auditService.log({
      tenantId,
      actorUserId: actorId,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: createdUser.id,
      afterSnapshot: createdSummary,
    });

    return createdSummary;
  }

  async findOne(tenantId: string, userId: string) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }

    return this.mapUserSummary(user);
  }

  async update(
    tenantId: string,
    userId: string,
    dto: UpdateUserDto,
    actorId: string,
  ) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }

    const ownership = await this.getTenantOwnershipContext(
      tenantId,
      actorId,
      userId,
    );
    if (ownership.isTargetOwner) {
      if (dto.status === UserStatus.DISABLED) {
        throw new ForbiddenException(
          'The tenant owner account cannot be disabled.',
        );
      }
      if (
        dto.accountType === 'SERVICE_ACCOUNT' ||
        dto.isServiceAccount === true
      ) {
        throw new ForbiddenException(
          'The tenant owner account cannot be converted to a service account.',
        );
      }
    }

    if (dto.businessUnitId) {
      const businessUnit = await this.usersRepository.findBusinessUnitById(
        tenantId,
        dto.businessUnitId,
      );
      if (!businessUnit) {
        throw new BadRequestException(
          'Business unit was not found for this tenant.',
        );
      }
    }

    const normalizedEmail = dto.email ? normalizeEmail(dto.email) : undefined;
    if (normalizedEmail && normalizedEmail !== user.email) {
      const existingUser = await this.usersRepository.findByTenantIdAndEmail(
        tenantId,
        normalizedEmail,
      );
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Email is already in use.');
      }
    }

    await this.usersRepository.update(userId, {
      ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
      ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(dto.businessUnitId ? { businessUnitId: dto.businessUnitId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.accountType !== undefined
        ? { isServiceAccount: dto.accountType === 'SERVICE_ACCOUNT' }
        : {}),
      ...(dto.accountType === undefined && dto.isServiceAccount !== undefined
        ? { isServiceAccount: dto.isServiceAccount }
        : {}),
      ...(this.hasPreferencePatch(dto)
        ? {
            preferencesJson: this.buildPreferencesJson(
              dto,
              user.preferencesJson,
            ),
          }
        : {}),
      updatedById: actorId,
    });

    // A business unit change moves the user to a different organization, which
    // changes the settings and branding they resolve to. Drop the cached
    // mapping so the next request reflects the move immediately.
    if (dto.businessUnitId) {
      this.activeOrganizationService.invalidateUser(user.tenantId, userId);
    }

    const updatedUser = await this.findByIdWithAccess(userId);
    return this.mapUserSummary(updatedUser);
  }

  markLastLogin(userId: string) {
    return this.usersRepository.markLastLogin(userId);
  }

  async assignRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
    actorId: string,
  ) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }
    const ownership = await this.getTenantOwnershipContext(
      tenantId,
      actorId,
      userId,
    );

    const beforeSummary = this.mapUserSummary(user);

    const roles = await this.rolesRepository.findByIds(tenantId, roleIds);

    if (roles.length !== roleIds.length) {
      throw new BadRequestException(
        'One or more roles do not belong to this tenant.',
      );
    }

    if (roles.some((role) => !role.isActive)) {
      throw new BadRequestException('Inactive roles cannot be assigned.');
    }

    const actor = await this.findByIdWithAccess(actorId);
    const actorEffectiveRoleKeys = actor
      ? this.resolveEffectiveRoles(actor).map((role) => role.key)
      : [];

    const canAssignPrivilegedRoles =
      ownership.isActorOwner ||
      actorEffectiveRoleKeys.includes(ROLE_KEYS.SYSTEM_ADMIN);

    if (!canAssignPrivilegedRoles && roles.some((role) => role.isSystem)) {
      throw new ForbiddenException(
        'Only tenant owners and system administrators can assign system roles.',
      );
    }

    const includesGlobalAdministrator = roles.some(
      (role) => role.key === ROLE_KEYS.GLOBAL_ADMIN,
    );

    if (includesGlobalAdministrator && !ownership.isTargetOwner) {
      throw new ForbiddenException(
        'Global Administrator can only be assigned to the tenant owner.',
      );
    }

    if (ownership.isTargetOwner) {
      const globalAdministrator = await this.rolesRepository.findByKeyAndTenant(
        tenantId,
        ROLE_KEYS.GLOBAL_ADMIN,
      );

      if (globalAdministrator && !roleIds.includes(globalAdministrator.id)) {
        throw new ForbiddenException(
          'The tenant owner cannot be downgraded from Global Administrator.',
        );
      }
    }

    const updatedUser = await this.usersRepository.replaceRoles(
      tenantId,
      userId,
      roleIds,
      actorId,
    );

    if (!updatedUser || updatedUser.tenantId !== tenantId) {
      throw new NotFoundException('Updated user could not be loaded.');
    }

    const afterSummary = this.mapUserSummary(updatedUser);

    await this.auditService.log({
      tenantId,
      actorUserId: actorId,
      action: 'USER_ROLE_ASSIGNMENT_UPDATED',
      entityType: 'User',
      entityId: updatedUser.id,
      beforeSnapshot: beforeSummary,
      afterSnapshot: afterSummary,
    });

    return afterSummary;
  }

  async assignDirectPermissions(
    tenantId: string,
    userId: string,
    permissionIds: string[],
    actorId: string,
  ) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }

    const ownership = await this.getTenantOwnershipContext(
      tenantId,
      actorId,
      userId,
    );
    this.assertUserAccessChangeAllowed(ownership);

    const beforeSummary = this.mapUserSummary(user);
    const permissions = await this.permissionsService.findByIds(
      tenantId,
      permissionIds,
    );

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException(
        'One or more permissions do not belong to this tenant.',
      );
    }

    const updatedUser = await this.usersRepository.replaceDirectPermissions(
      tenantId,
      userId,
      permissionIds,
      actorId,
    );

    if (!updatedUser || updatedUser.tenantId !== tenantId) {
      throw new NotFoundException('Updated user could not be loaded.');
    }

    const afterSummary = this.mapUserSummary(updatedUser);

    await this.auditService.log({
      tenantId,
      actorUserId: actorId,
      action: 'USER_DIRECT_PERMISSIONS_UPDATED',
      entityType: 'User',
      entityId: updatedUser.id,
      beforeSnapshot: beforeSummary,
      afterSnapshot: afterSummary,
    });

    return afterSummary;
  }

  async assignBusinessUnit(
    tenantId: string,
    userId: string,
    businessUnitId: string,
    actorId: string,
  ) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }

    if (!businessUnitId) {
      throw new BadRequestException('Business unit is required.');
    }

    const businessUnit = await this.usersRepository.findBusinessUnitById(
      tenantId,
      businessUnitId,
    );

    if (!businessUnit) {
      throw new BadRequestException(
        'Business unit was not found for this tenant.',
      );
    }

    const ownership = await this.getTenantOwnershipContext(
      tenantId,
      actorId,
      userId,
    );

    if (ownership.isTargetOwner && user.businessUnitId !== businessUnitId) {
      throw new ForbiddenException(
        'The tenant owner business unit cannot be modified.',
      );
    }

    if (user.businessUnitId === businessUnitId) {
      return this.mapUserSummary(user);
    }

    const beforeSummary = this.mapUserSummary(user);

    await this.usersRepository.update(userId, {
      businessUnitId,
      updatedById: actorId,
    });

    const updatedUser = await this.usersRepository.findByIdWithAccess(userId);

    if (!updatedUser || updatedUser.tenantId !== tenantId) {
      throw new NotFoundException('Updated user could not be loaded.');
    }

    const afterSummary = this.mapUserSummary(updatedUser);

    await this.auditService.log({
      tenantId,
      actorUserId: actorId,
      action: 'USER_BUSINESS_UNIT_UPDATED',
      entityType: 'User',
      entityId: updatedUser.id,
      beforeSnapshot: beforeSummary,
      afterSnapshot: afterSummary,
    });

    return afterSummary;
  }

  async remove(tenantId: string, userId: string, actorId: string) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }

    if (user.id === actorId) {
      throw new BadRequestException('You cannot delete your own account.');
    }

    const ownership = await this.getTenantOwnershipContext(
      tenantId,
      actorId,
      userId,
    );

    if (ownership.isTargetOwner) {
      throw new ForbiddenException(
        'The tenant owner account cannot be deleted.',
      );
    }

    const beforeSummary = this.mapUserSummary(user);

    await this.usersRepository.delete(userId);

    await this.auditService.log({
      tenantId,
      actorUserId: actorId,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: userId,
      beforeSnapshot: beforeSummary,
    });

    return { deleted: true, id: userId };
  }

  async linkEmployee(
    tenantId: string,
    userId: string,
    dto: LinkUserEmployeeDto,
    actorId: string,
  ) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }
    if (user.isServiceAccount) {
      throw new BadRequestException(
        'Service accounts cannot be linked to employees.',
      );
    }

    const employee = await this.usersRepository.findEmployeeForLinking(
      tenantId,
      dto.employeeId,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    if (employee.userId && employee.userId !== userId) {
      throw new ConflictException(
        'This employee is already linked to another user.',
      );
    }

    const linkResult = await this.usersRepository.linkEmployee(
      tenantId,
      userId,
      employee.id,
      actorId,
    );

    if (linkResult.count === 0) {
      throw new ConflictException(
        'This employee could not be linked because the link changed. Refresh and try again.',
      );
    }

    const updatedUser = await this.findByIdWithAccess(userId);
    return this.mapUserSummary(updatedUser);
  }

  async listRoles(tenantId: string, userId: string) {
    await this.assertUserBelongsToTenant(tenantId, userId);
    const rows = await this.usersRepository.listUserRoles(tenantId, userId);
    return rows.map((row) => ({
      id: row.id,
      roleId: row.roleId,
      roleName: row.role.name,
      roleDescription: row.role.description,
      roleType: row.role.roleType,
      accessLevel: row.role.accessLevel,
      assignedOn: row.createdAt,
      assignedBy: row.createdById,
    }));
  }

  async addRole(
    tenantId: string,
    userId: string,
    roleId: string,
    actorId: string,
  ) {
    await this.assertUserBelongsToTenant(tenantId, userId);
    const role = await this.rolesRepository.findByIds(tenantId, [roleId]);
    if (role.length !== 1) {
      throw new BadRequestException('Role does not belong to this tenant.');
    }
    if (!role[0].isActive) {
      throw new BadRequestException('Inactive roles cannot be assigned.');
    }
    try {
      const row = await this.usersRepository.addUserRole(
        tenantId,
        userId,
        roleId,
        actorId,
      );
      return {
        id: row.id,
        roleId: row.roleId,
        roleName: row.role.name,
        roleDescription: row.role.description,
        roleType: row.role.roleType,
        accessLevel: row.role.accessLevel,
        assignedOn: row.createdAt,
        assignedBy: row.createdById,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This role is already assigned.');
      }
      throw error;
    }
  }

  async removeRole(tenantId: string, userId: string, userRoleId: string) {
    const result = await this.usersRepository.removeUserRole(
      tenantId,
      userId,
      userRoleId,
    );
    if (!result.count)
      throw new NotFoundException('Role assignment was not found.');
    return { id: userRoleId, deleted: true };
  }

  async listAccessTeams(tenantId: string, userId: string) {
    await this.assertUserBelongsToTenant(tenantId, userId);
    const rows = await this.usersRepository.listAccessTeamMemberships(
      tenantId,
      userId,
    );
    return rows.map((row) => ({
      id: row.id,
      teamId: row.teamId,
      accessTeamName: row.team.name,
      accessTeamDescription: row.team.description,
      teamType: row.team.teamType,
      isOwner: row.isOwner,
      joinedOn: row.createdAt,
    }));
  }

  async addAccessTeam(
    tenantId: string,
    userId: string,
    teamId: string,
    isOwner: boolean,
    actorId: string,
  ) {
    await this.assertUserBelongsToTenant(tenantId, userId);
    const team = await this.usersRepository.findActiveAccessTeam(
      tenantId,
      teamId,
    );
    if (!team) {
      throw new BadRequestException('Access team was not found.');
    }
    try {
      const row = await this.usersRepository.addAccessTeamMembership(
        tenantId,
        userId,
        teamId,
        isOwner,
        actorId,
      );
      return {
        id: row.id,
        teamId: row.teamId,
        accessTeamName: row.team.name,
        accessTeamDescription: row.team.description,
        teamType: row.team.teamType,
        isOwner: row.isOwner,
        joinedOn: row.createdAt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This user is already on the access team.');
      }
      throw error;
    }
  }

  async updateAccessTeam(
    tenantId: string,
    userId: string,
    teamMemberId: string,
    isOwner: boolean,
  ) {
    const result = await this.usersRepository.updateAccessTeamMembership(
      tenantId,
      userId,
      teamMemberId,
      { isOwner },
    );
    if (!result.count)
      throw new NotFoundException('Access team membership was not found.');
    return { id: teamMemberId, isOwner };
  }

  async removeAccessTeam(
    tenantId: string,
    userId: string,
    teamMemberId: string,
  ) {
    const result = await this.usersRepository.removeAccessTeamMembership(
      tenantId,
      userId,
      teamMemberId,
    );
    if (!result.count)
      throw new NotFoundException('Access team membership was not found.');
    return { id: teamMemberId, deleted: true };
  }

  async listSessions(tenantId: string, userId: string) {
    await this.assertUserBelongsToTenant(tenantId, userId);
    const tokenRows = await this.usersRepository.listSessions(tenantId, userId);
    const now = Date.now();
    const grouped = new Map<
      string,
      {
        id: string;
        sessionId: string;
        appClientId: string | null;
        deviceId: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
        lastUsedAt: Date | null;
        lastActivityAt: Date | null;
        expiresAt: Date | null;
        revokedAt: Date | null;
        absoluteExpiresAt: Date | null;
        tokenCount: number;
        activeTokenCount: number;
      }
    >();

    for (const row of tokenRows) {
      const sessionId = row.sessionId ?? row.id;
      const current = grouped.get(sessionId);
      const isActive =
        !row.revokedAt &&
        row.expiresAt.getTime() > now &&
        (!row.absoluteExpiresAt || row.absoluteExpiresAt.getTime() > now);

      if (!current) {
        grouped.set(sessionId, {
          id: sessionId,
          sessionId,
          appClientId: row.appClientId,
          deviceId: row.deviceId,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
          lastActivityAt: row.lastActivityAt,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          absoluteExpiresAt: row.absoluteExpiresAt,
          tokenCount: 1,
          activeTokenCount: isActive ? 1 : 0,
        });
        continue;
      }

      current.tokenCount += 1;
      if (isActive) current.activeTokenCount += 1;
      current.createdAt = minDate(current.createdAt, row.createdAt);
      current.lastUsedAt = maxOptionalDate(current.lastUsedAt, row.lastUsedAt);
      current.lastActivityAt = maxOptionalDate(
        current.lastActivityAt,
        row.lastActivityAt,
      );
      current.expiresAt = maxOptionalDate(current.expiresAt, row.expiresAt);
      current.absoluteExpiresAt = maxOptionalDate(
        current.absoluteExpiresAt,
        row.absoluteExpiresAt,
      );
      current.revokedAt = maxOptionalDate(current.revokedAt, row.revokedAt);
      current.appClientId = current.appClientId ?? row.appClientId;
      current.deviceId = current.deviceId ?? row.deviceId;
      current.ipAddress = current.ipAddress ?? row.ipAddress;
      current.userAgent = current.userAgent ?? row.userAgent;
    }

    return Array.from(grouped.values())
      .map((session) => ({
        ...session,
        device: describeUserAgent(session.userAgent),
        sessionStatus:
          session.activeTokenCount > 0
            ? 'ACTIVE'
            : session.revokedAt
              ? 'REVOKED'
              : 'EXPIRED',
      }))
      .sort(
        (left, right) =>
          (
            right.lastActivityAt ??
            right.lastUsedAt ??
            right.createdAt
          ).getTime() -
          (left.lastActivityAt ?? left.lastUsedAt ?? left.createdAt).getTime(),
      );
  }

  async revokeSession(tenantId: string, userId: string, sessionId: string) {
    const result = await this.usersRepository.revokeSession(
      tenantId,
      userId,
      sessionId,
    );
    if (!result.count) throw new NotFoundException('Session was not found.');
    return { id: sessionId, revoked: true };
  }

  async revokeAllSessions(tenantId: string, userId: string) {
    const result = await this.usersRepository.revokeAllSessions(
      tenantId,
      userId,
    );
    return { revoked: result.count };
  }

  async listLoginHistory(tenantId: string, userId: string) {
    await this.assertUserBelongsToTenant(tenantId, userId);
    const rows = await this.usersRepository.listLoginHistory(tenantId, userId);
    if (!rows.length) {
      const sessions = await this.listSessions(tenantId, userId);
      return sessions.map((session) => ({
        id: session.id,
        loginTime: session.createdAt,
        event: 'SESSION_CREATED',
        user: '',
        email: '',
        result: session.sessionStatus,
        failureReason: '',
        ipAddress: session.ipAddress ?? '',
        userAgent: session.userAgent ?? '',
        appClient: session.appClientId ?? '',
        sessionId: session.sessionId ?? '',
      }));
    }
    return rows.map((row) => {
      const snapshot = readJsonRecord(row.afterSnapshot);
      return {
        id: row.id,
        loginTime: row.createdAt,
        event: row.action,
        user: row.actorUser
          ? `${row.actorUser.firstName} ${row.actorUser.lastName}`.trim()
          : '',
        email: stringFromRecord(snapshot, 'email'),
        result: stringFromRecord(snapshot, 'result') || row.action,
        failureReason: stringFromRecord(snapshot, 'failureReason'),
        ipAddress: stringFromRecord(snapshot, 'ipAddress'),
        userAgent: stringFromRecord(snapshot, 'userAgent'),
        appClient: stringFromRecord(snapshot, 'appClientId'),
        sessionId: stringFromRecord(snapshot, 'sessionId'),
      };
    });
  }

  async unlinkEmployee(tenantId: string, userId: string, actorId: string) {
    const user = await this.findByIdWithAccess(userId);

    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }

    if (!user.employee) {
      throw new BadRequestException('This user is not linked to an employee.');
    }

    const unlinkResult = await this.usersRepository.unlinkEmployee(
      tenantId,
      userId,
      actorId,
    );

    if (unlinkResult.count === 0) {
      throw new ConflictException(
        'This employee link could not be removed because it changed. Refresh and try again.',
      );
    }

    const updatedUser = await this.findByIdWithAccess(userId);
    return this.mapUserSummary(updatedUser);
  }

  private mapUserSummary(
    user: Awaited<ReturnType<UsersRepository['findByIdWithAccess']>>,
  ) {
    if (!user) {
      return null;
    }

    const directRoles = user.userRoles
      .map((userRole) => userRole.role)
      .filter((role) => role.isActive);
    const teamRoles = this.resolveTeamRoles(user);
    const effectiveRoles = this.resolveEffectiveRoles(user);

    return {
      userId: user.id,
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      subStatus: this.resolveUserSubStatus(user.status),
      userStatus: user.status,
      isServiceAccount: user.isServiceAccount,
      lastLoginAt: user.lastLoginAt,
      createdById:
        user.createdById ??
        (user.tenant.ownerUserId === user.id
          ? user.id
          : user.tenant.ownerUserId),
      ownerUserId:
        user.createdById ??
        (user.tenant.ownerUserId === user.id
          ? user.id
          : user.tenant.ownerUserId),
      businessUnitId: user.businessUnitId,
      businessUnitName: user.businessUnit?.name ?? null,
      businessUnit: user.businessUnit
        ? {
            id: user.businessUnit.id,
            name: user.businessUnit.name,
            organizationId: user.businessUnit.organizationId,
            organizationName: user.businessUnit.organization.name,
          }
        : null,
      linkedEmployee: user.employee
        ? {
            id: user.employee.id,
            employeeCode: user.employee.employeeCode,
            fullName: `${user.employee.firstName} ${user.employee.lastName}`,
            email: user.employee.email,
            businessUnitId: user.employee.businessUnitId,
            organizationName: user.employee.organization?.name ?? null,
            businessUnitName: user.employee.businessUnit?.name ?? null,
            departmentName: user.employee.department?.name ?? null,
            teamName: user.employee.team?.name ?? null,
            designationName: user.employee.designation?.name ?? null,
            managerName: user.employee.manager
              ? `${user.employee.manager.firstName} ${user.employee.manager.lastName}`.trim()
              : null,
            employmentStatus: user.employee.employmentStatus,
            hireDate: user.employee.hireDate,
          }
        : null,
      linkedEmployeeName: user.employee
        ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
        : null,
      linkedEmployeeId: user.employee?.id ?? null,
      accountType:
        user.tenant.ownerUserId === user.id
          ? 'TENANT_OWNER'
          : effectiveRoles.some((role) => role.key === ROLE_KEYS.SYSTEM_ADMIN)
            ? 'ADMINISTRATOR'
            : user.employee
              ? 'EMPLOYEE_USER'
              : user.isServiceAccount
                ? 'SERVICE_ACCOUNT'
                : 'EXTERNAL_USER',
      ...this.readPreferencesJson(user.preferencesJson),
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        status: user.tenant.status,
      },
      roles: directRoles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
      })),
      teamRoles: teamRoles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
      })),
      teams: user.teamMemberships.map((membership) => ({
        id: membership.team.id,
        name: membership.team.name,
        key: membership.team.key,
        teamType: membership.team.teamType,
        isActive: membership.team.isActive,
      })),
      effectiveRoles: effectiveRoles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
      })),
      effectivePrivileges: this.resolveEffectivePrivileges(effectiveRoles),
      directPermissions: user.userPermissions.map((userPermission) => ({
        id: userPermission.permission.id,
        key: userPermission.permission.key,
        name: userPermission.permission.name,
        description: userPermission.permission.description,
      })),
      effectivePermissionKeys: Array.from(
        new Set([
          ...user.userRoles.flatMap((userRole) =>
            userRole.role.rolePermissions.map(
              (rolePermission) => rolePermission.permission.key,
            ),
          ),
          ...teamRoles.flatMap((role) =>
            role.rolePermissions.map(
              (rolePermission) => rolePermission.permission.key,
            ),
          ),
          ...effectiveRoles.flatMap((role) =>
            role.rolePrivileges
              .filter((privilege) => privilege.accessLevel !== 'NONE')
              .map(
                (privilege) =>
                  `${privilege.entityKey}.${privilege.privilege.toLowerCase()}`,
              ),
          ),
          ...effectiveRoles.flatMap((role) =>
            role.miscPermissions
              .filter((permission) => permission.enabled)
              .map((permission) => permission.permissionKey),
          ),
          ...user.userPermissions.map(
            (userPermission) => userPermission.permission.key,
          ),
        ]),
      ),
      ownership: {
        isTenantOwner: user.tenant.ownerUserId === user.id,
        designation:
          user.tenant.ownerUserId === user.id
            ? 'TENANT_OWNER'
            : effectiveRoles.some((role) => role.key === ROLE_KEYS.SYSTEM_ADMIN)
              ? 'SYSTEM_ADMIN'
              : 'TENANT_USER',
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async assertUserBelongsToTenant(tenantId: string, userId: string) {
    const user = await this.findByIdWithAccess(userId);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User was not found for this tenant.');
    }
    return user;
  }

  private readPreferencesJson(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        timezone: '',
        language: '',
        dateFormat: '',
        timeFormat: '',
      };
    }
    const source = value as Record<string, unknown>;
    return {
      timezone: typeof source.timezone === 'string' ? source.timezone : '',
      language: typeof source.language === 'string' ? source.language : '',
      dateFormat:
        typeof source.dateFormat === 'string' ? source.dateFormat : '',
      timeFormat:
        typeof source.timeFormat === 'string' ? source.timeFormat : '',
    };
  }

  private resolveUserSubStatus(status: UserStatus) {
    if (status === UserStatus.ACTIVE) return 'OPEN';
    if (status === UserStatus.INVITED) return 'PENDING_INVITATION';
    if (status === UserStatus.DISABLED) return 'DISABLED';
    return '';
  }

  private hasPreferencePatch(dto: UpdateUserDto) {
    return (
      dto.timezone !== undefined ||
      dto.language !== undefined ||
      dto.dateFormat !== undefined ||
      dto.timeFormat !== undefined
    );
  }

  private buildPreferencesJson(
    dto: Pick<
      CreateUserDto | UpdateUserDto,
      'timezone' | 'language' | 'dateFormat' | 'timeFormat'
    >,
    existing?: Prisma.JsonValue | null,
  ): Prisma.InputJsonObject {
    const current = this.readPreferencesJson(existing);
    return {
      ...current,
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.dateFormat !== undefined ? { dateFormat: dto.dateFormat } : {}),
      ...(dto.timeFormat !== undefined ? { timeFormat: dto.timeFormat } : {}),
    };
  }

  private async getTenantOwnershipContext(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
  ) {
    const ownerUserId =
      await this.usersRepository.findTenantOwnerUserId(tenantId);

    return {
      ownerUserId,
      isActorOwner: ownerUserId === actorUserId,
      isTargetOwner: ownerUserId === targetUserId,
    };
  }

  private assertUserAccessChangeAllowed(ownership: { isTargetOwner: boolean }) {
    if (ownership.isTargetOwner) {
      throw new ForbiddenException(
        'The tenant owner account access cannot be modified.',
      );
    }
  }

  private resolveTeamRoles(
    user: NonNullable<
      Awaited<ReturnType<UsersRepository['findByIdWithAccess']>>
    >,
  ) {
    return user.teamMemberships.flatMap((membership) =>
      membership.team.isActive
        ? membership.team.teamRoles
            .map((teamRole) => teamRole.role)
            .filter((role) => role.isActive)
        : [],
    );
  }

  private resolveEffectiveRoles(
    user: NonNullable<
      Awaited<ReturnType<UsersRepository['findByIdWithAccess']>>
    >,
  ) {
    const directRoles = user.userRoles
      .map((userRole) => userRole.role)
      .filter((role) => role.isActive);
    const teamRoles = this.resolveTeamRoles(user);

    return Array.from(
      new Map(
        [...directRoles, ...teamRoles].map((role) => [role.id, role]),
      ).values(),
    );
  }

  private resolveEffectivePrivileges(
    roles: ReturnType<UsersService['resolveEffectiveRoles']>,
  ) {
    const effectiveByKey = new Map<
      string,
      {
        entityKey: string;
        privilege: string;
        accessLevel: keyof typeof SECURITY_ACCESS_LEVEL_WEIGHT;
        sourceRoleNames: string[];
      }
    >();

    for (const role of roles) {
      for (const privilege of role.rolePrivileges) {
        const key = `${privilege.entityKey}:${privilege.privilege}`;
        const current = effectiveByKey.get(key);
        if (
          !current ||
          SECURITY_ACCESS_LEVEL_WEIGHT[privilege.accessLevel] >
            SECURITY_ACCESS_LEVEL_WEIGHT[current.accessLevel]
        ) {
          effectiveByKey.set(key, {
            entityKey: privilege.entityKey,
            privilege: privilege.privilege,
            accessLevel: privilege.accessLevel,
            sourceRoleNames: [role.name],
          });
          continue;
        }

        if (
          SECURITY_ACCESS_LEVEL_WEIGHT[privilege.accessLevel] ===
          SECURITY_ACCESS_LEVEL_WEIGHT[current.accessLevel]
        ) {
          current.sourceRoleNames.push(role.name);
        }
      }
    }

    return Array.from(effectiveByKey.values()).filter(
      (privilege) => privilege.accessLevel !== 'NONE',
    );
  }
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxOptionalDate<T extends Date | null | undefined>(left: T, right: T) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function readJsonRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function describeUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return '';
  if (userAgent.includes('Edg/')) return 'Microsoft Edge';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    return 'Safari';
  }
  return userAgent.slice(0, 80);
}
