import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail } from '../../common/utils/email.util';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesRepository } from '../roles/roles.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  findByTenant(tenantId: string) {
    return this.usersRepository
      .findByTenant(tenantId)
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

    const includesGlobalAdministrator = roles.some(
      (role) => role.key === 'global-admin',
    );

    if (includesGlobalAdministrator && !ownership.isTargetOwner) {
      throw new ForbiddenException(
        'Global Administrator can only be assigned to the tenant owner.',
      );
    }

    if (ownership.isTargetOwner) {
      const globalAdministrator = await this.rolesRepository.findByKeyAndTenant(
        tenantId,
        'global-admin',
      );

      if (
        globalAdministrator &&
        !roleIds.includes(globalAdministrator.id)
      ) {
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

  private mapUserSummary(
    user: Awaited<ReturnType<UsersRepository['findByIdWithAccess']>>,
  ) {
    if (!user) {
      return null;
    }

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
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        status: user.tenant.status,
      },
      roles: user.userRoles.map((userRole) => ({
        id: userRole.role.id,
        key: userRole.role.key,
        name: userRole.role.name,
      })),
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
          ...user.userRoles.flatMap((userRole) =>
            userRole.role.rolePrivileges
              .filter((privilege) => privilege.accessLevel !== 'NONE')
              .map(
                (privilege) =>
                  `${privilege.entityKey}.${privilege.privilege.toLowerCase()}`,
              ),
          ),
          ...user.userRoles.flatMap((userRole) =>
            userRole.role.miscPermissions
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
            : user.userRoles.some(
                  (userRole) => userRole.role.key === 'system-admin',
                )
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
}
