import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SecurityPrivilege } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  ENTITY_KEYS,
  ROLE_KEYS,
  SECURITY_ACCESS_LEVEL_WEIGHT,
} from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { normalizeEmail } from '../../common/utils/email.util';
import { AuditService } from '../audit/audit.service';
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

  findByEmailWithAccess(email: string) {
    return this.usersRepository.findByEmailWithAccess(email);
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
    const existingUser =
      await this.usersRepository.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('Email is already in use.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
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
      createdById: actorId,
      updatedById: actorId,
    });

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
    this.assertUserAccessChangeAllowed(ownership);

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
      const existingUser =
        await this.usersRepository.findByEmail(normalizedEmail);
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Email is already in use.');
      }
    }

    await this.usersRepository.update(userId, {
      ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
      ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(dto.businessUnitId ? { businessUnitId: dto.businessUnitId } : {}),
      updatedById: actorId,
    });

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
    this.assertUserAccessChangeAllowed(ownership);

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
    this.assertUserAccessChangeAllowed(ownership);

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
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      isServiceAccount: user.isServiceAccount,
      lastLoginAt: user.lastLoginAt,
      businessUnitId: user.businessUnitId,
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
            departmentName: user.employee.department?.name ?? null,
          }
        : null,
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
