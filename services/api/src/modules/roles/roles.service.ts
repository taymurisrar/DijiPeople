import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  RoleAccessLevel,
  RoleType,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import {
  MISC_PERMISSION_DEFINITIONS,
  RBAC_ENTITIES,
  RBAC_PRIVILEGES,
  SECURITY_ACCESS_LEVEL_WEIGHT,
  matrixPrivilegeToPermissionKey,
} from '../../common/constants/rbac-matrix';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleMatrixDto } from './dto/update-role-matrix.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesRepository } from './roles.repository';

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  findByTenant(tenantId: string) {
    return this.rolesRepository.findByTenant(tenantId);
  }

  async findByIdAndTenant(tenantId: string, roleId: string) {
    const role = await this.rolesRepository.findByIdAndTenant(tenantId, roleId);

    if (!role) {
      throw new NotFoundException('Role was not found for this tenant.');
    }

    return role;
  }

  async create(currentUser: AuthenticatedUser, dto: CreateRoleDto) {
    const existingRoles = await this.rolesRepository.findByTenant(
      currentUser.tenantId,
    );

    if (
      existingRoles.some(
        (role) => role.key.toLowerCase() === dto.key.trim().toLowerCase(),
      )
    ) {
      throw new ConflictException('Role key is already in use.');
    }

    const permissionIds = dto.permissionIds ?? [];
    if (permissionIds.length > 0) {
      const permissions = await this.permissionsService.findByIds(
        currentUser.tenantId,
        permissionIds,
      );

      if (permissions.length !== permissionIds.length) {
        throw new BadRequestException(
          'One or more permissions do not belong to this tenant.',
        );
      }

      if (!this.canEscalateBeyondOwnAccess(currentUser)) {
        const unauthorizedPermission = permissions.find(
          (permission) => !currentUser.permissionKeys.includes(permission.key),
        );

        if (unauthorizedPermission) {
          throw new ForbiddenException(
            'Custom roles cannot exceed your own effective access.',
          );
        }
      }
    }

    const role = await this.rolesRepository.create({
      tenantId: currentUser.tenantId,
      name: dto.name.trim(),
      key: dto.key.trim().toLowerCase(),
      roleType: RoleType.CUSTOM,
      isSystem: false,
      isEditable: true,
      isCloneable: true,
      accessLevel: dto.accessLevel ?? RoleAccessLevel.USER,
      description: dto.description?.trim(),
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    if (permissionIds.length > 0) {
      return this.rolesRepository.replacePermissions(
        currentUser.tenantId,
        role.id,
        permissionIds,
        currentUser.userId,
      );
    }

    return this.rolesRepository.findByIdAndTenant(
      currentUser.tenantId,
      role.id,
    );
  }

  async updatePermissions(
    tenantId: string,
    roleId: string,
    permissionIds: string[],
    actorId: string,
  ) {
    const role = await this.rolesRepository.findByIdAndTenant(tenantId, roleId);

    if (!role) {
      throw new NotFoundException('Role was not found for this tenant.');
    }

    if (role.isSystem || !role.isEditable) {
      throw new ForbiddenException(
        'This role is locked. Clone it before changing permissions.',
      );
    }

    const permissions = await this.permissionsService.findByIds(
      tenantId,
      permissionIds,
    );

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException(
        'One or more permissions do not belong to this tenant.',
      );
    }

    return this.rolesRepository.replacePermissions(
      tenantId,
      roleId,
      permissionIds,
      actorId,
    );
  }

  async update(
    currentUser: AuthenticatedUser,
    roleId: string,
    dto: UpdateRoleDto,
  ) {
    const role = await this.rolesRepository.findByIdAndTenant(
      currentUser.tenantId,
      roleId,
    );

    if (!role) {
      throw new NotFoundException('Role was not found for this tenant.');
    }

    if (role.isSystem || !role.isEditable) {
      throw new ForbiddenException(
        'This role is locked. Clone it before changing permissions.',
      );
    }

    const duplicateRole = (
      await this.rolesRepository.findByTenant(currentUser.tenantId)
    ).find(
      (existingRole) =>
        existingRole.id !== roleId &&
        existingRole.name.trim().toLowerCase() ===
          dto.name.trim().toLowerCase(),
    );

    if (duplicateRole) {
      throw new ConflictException('Role name is already in use.');
    }

    const permissionIds =
      dto.permissionIds ??
      role.rolePermissions.map((item) => item.permissionId);
    const permissions = await this.permissionsService.findByIds(
      currentUser.tenantId,
      permissionIds,
    );

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException(
        'One or more permissions do not belong to this tenant.',
      );
    }

    await this.rolesRepository.update(roleId, {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      ...(dto.accessLevel ? { accessLevel: dto.accessLevel } : {}),
      updatedById: currentUser.userId,
    });

    const updatedRole = await this.rolesRepository.replacePermissions(
      currentUser.tenantId,
      roleId,
      permissionIds,
      currentUser.userId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'ROLE_UPDATED',
      entityType: 'Role',
      entityId: roleId,
      beforeSnapshot: this.mapRoleSummary(role),
      afterSnapshot: this.mapRoleSummary(updatedRole),
    });

    return updatedRole;
  }

  async remove(currentUser: AuthenticatedUser, roleId: string) {
    const role = await this.rolesRepository.findByIdAndTenant(
      currentUser.tenantId,
      roleId,
    );

    if (!role) {
      throw new NotFoundException('Role was not found for this tenant.');
    }

    if (role.isSystem) {
      throw new ForbiddenException(
        'System roles cannot be deleted from tenant settings.',
      );
    }

    if (role.userRoles.length > 0) {
      throw new BadRequestException(
        'Remove this role from assigned users before deleting it.',
      );
    }

    await this.rolesRepository.delete(roleId);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'ROLE_DELETED',
      entityType: 'Role',
      entityId: roleId,
      beforeSnapshot: this.mapRoleSummary(role),
    });

    return { deleted: true, id: roleId };
  }

  async updateMatrix(
    currentUser: AuthenticatedUser,
    roleId: string,
    dto: UpdateRoleMatrixDto,
  ) {
    const role = await this.rolesRepository.findByIdAndTenant(
      currentUser.tenantId,
      roleId,
    );

    if (!role) {
      throw new NotFoundException('Role was not found for this tenant.');
    }

    if (role.isSystem || !role.isEditable) {
      throw new ForbiddenException(
        'This role is locked. Clone it before changing permissions.',
      );
    }

    this.assertValidMatrix(dto);

    if (!this.canEscalateBeyondOwnAccess(currentUser)) {
      await this.assertMatrixWithinActorAccess(currentUser, dto);
    }

    const legacyPermissionKeys = this.resolveLegacyPermissionKeys(dto);
    const permissions = await this.permissionsService.findByTenant(
      currentUser.tenantId,
    );
    const legacyPermissionIds = permissions
      .filter((permission) => legacyPermissionKeys.has(permission.key))
      .map((permission) => permission.id);

    await this.rolesRepository.replacePermissions(
      currentUser.tenantId,
      roleId,
      legacyPermissionIds,
      currentUser.userId,
    );

    const updatedRole = await this.rolesRepository.replaceMatrix(
      currentUser.tenantId,
      roleId,
      dto.privileges,
      dto.miscPermissions,
      currentUser.userId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'ROLE_MATRIX_UPDATED',
      entityType: 'Role',
      entityId: roleId,
      beforeSnapshot: this.mapRoleSummary(role),
      afterSnapshot: this.mapRoleSummary(updatedRole),
    });

    return updatedRole;
  }

  async clone(currentUser: AuthenticatedUser, roleId: string) {
    const sourceRole = await this.rolesRepository.findByIdAndTenant(
      currentUser.tenantId,
      roleId,
    );

    if (!sourceRole) {
      throw new NotFoundException('Role was not found for this tenant.');
    }

    if (!sourceRole.isCloneable) {
      throw new ForbiddenException('This role cannot be cloned.');
    }

    const baseName = `${sourceRole.name} Copy`;
    const existingRoles = await this.rolesRepository.findByTenant(
      currentUser.tenantId,
    );
    const uniqueName = this.resolveUniqueName(
      baseName,
      existingRoles.map((role) => role.name),
    );
    const key = this.normalizeRoleKey(uniqueName);

    const clone = await this.rolesRepository.create({
      tenantId: currentUser.tenantId,
      name: uniqueName,
      key,
      description: sourceRole.description,
      roleType: RoleType.CUSTOM,
      isSystem: false,
      isEditable: true,
      isCloneable: true,
      accessLevel: sourceRole.accessLevel,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    await this.rolesRepository.replacePermissions(
      currentUser.tenantId,
      clone.id,
      sourceRole.rolePermissions.map((item) => item.permissionId),
      currentUser.userId,
    );

    return this.rolesRepository.replaceMatrix(
      currentUser.tenantId,
      clone.id,
      sourceRole.rolePrivileges.map((item) => ({
        entityKey: item.entityKey,
        privilege: item.privilege,
        accessLevel: item.accessLevel,
      })),
      sourceRole.miscPermissions.map((item) => ({
        permissionKey: item.permissionKey,
        enabled: item.enabled,
      })),
      currentUser.userId,
    );
  }

  private mapRoleSummary(
    role:
      | Awaited<ReturnType<RolesRepository['findByIdAndTenant']>>
      | Awaited<ReturnType<RolesRepository['findByTenant']>>[number]
      | null,
  ) {
    if (!role) {
      return null;
    }

    return {
      id: role.id,
      name: role.name,
      key: role.key,
      description: role.description,
      accessLevel: role.accessLevel,
      isSystem: role.isSystem,
      roleType: role.roleType,
      isEditable: role.isEditable,
      isCloneable: role.isCloneable,
      userCount: role.userRoles.length,
      permissionKeys: role.rolePermissions.map((item) => item.permission.key),
    };
  }

  private assertValidMatrix(dto: UpdateRoleMatrixDto) {
    const validEntityKeys = new Set(RBAC_ENTITIES.map((entity) => entity.key));
    const validPrivileges = new Set<SecurityPrivilege>(RBAC_PRIVILEGES);
    const validMiscPermissionKeys = new Set(
      MISC_PERMISSION_DEFINITIONS.map((permission) => permission.key),
    );

    for (const item of dto.privileges) {
      if (!validEntityKeys.has(item.entityKey)) {
        throw new BadRequestException(`Invalid entity key: ${item.entityKey}.`);
      }

      if (!validPrivileges.has(item.privilege)) {
        throw new BadRequestException(`Invalid privilege: ${item.privilege}.`);
      }
    }

    for (const item of dto.miscPermissions) {
      if (!validMiscPermissionKeys.has(item.permissionKey)) {
        throw new BadRequestException(
          `Invalid miscellaneous permission: ${item.permissionKey}.`,
        );
      }
    }
  }

  private resolveLegacyPermissionKeys(dto: UpdateRoleMatrixDto) {
    const permissionKeys = new Set<string>();

    for (const item of dto.privileges) {
      if (item.accessLevel === SecurityAccessLevel.NONE) {
        continue;
      }
      permissionKeys.add(
        matrixPrivilegeToPermissionKey(item.entityKey, item.privilege),
      );
    }

    for (const item of dto.miscPermissions) {
      if (item.enabled) {
        permissionKeys.add(item.permissionKey);
      }
    }

    return permissionKeys;
  }

  private async assertMatrixWithinActorAccess(
    currentUser: AuthenticatedUser,
    dto: UpdateRoleMatrixDto,
  ) {
    const roles = await this.rolesRepository.findByIds(
      currentUser.tenantId,
      currentUser.roleIds,
    );
    const actorMaxByPrivilege = new Map<string, SecurityAccessLevel>();

    for (const role of roles) {
      for (const privilege of role.rolePrivileges) {
        const key = `${privilege.entityKey}:${privilege.privilege}`;
        const current =
          actorMaxByPrivilege.get(key) ?? SecurityAccessLevel.NONE;
        if (
          SECURITY_ACCESS_LEVEL_WEIGHT[privilege.accessLevel] >
          SECURITY_ACCESS_LEVEL_WEIGHT[current]
        ) {
          actorMaxByPrivilege.set(key, privilege.accessLevel);
        }
      }
    }

    for (const item of dto.privileges) {
      const actorAccess =
        actorMaxByPrivilege.get(`${item.entityKey}:${item.privilege}`) ??
        SecurityAccessLevel.NONE;
      if (
        SECURITY_ACCESS_LEVEL_WEIGHT[item.accessLevel] >
        SECURITY_ACCESS_LEVEL_WEIGHT[actorAccess]
      ) {
        throw new ForbiddenException(
          'Custom roles cannot exceed your own effective access.',
        );
      }
    }
  }

  private canEscalateBeyondOwnAccess(currentUser: AuthenticatedUser) {
    return (
      currentUser.accessContext?.isTenantOwner ||
      currentUser.accessContext?.isSystemAdministrator
    );
  }

  private resolveUniqueName(baseName: string, existingNames: string[]) {
    const normalizedExistingNames = new Set(
      existingNames.map((name) => name.trim().toLowerCase()),
    );
    let candidate = baseName;
    let counter = 2;

    while (normalizedExistingNames.has(candidate.toLowerCase())) {
      candidate = `${baseName} ${counter}`;
      counter += 1;
    }

    return candidate;
  }

  private normalizeRoleKey(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
