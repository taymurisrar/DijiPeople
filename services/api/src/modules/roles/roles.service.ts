import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateRoleDto } from './dto/create-role.dto';
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
    }

    const role = await this.rolesRepository.create({
      tenantId: currentUser.tenantId,
      name: dto.name.trim(),
      key: dto.key.trim().toLowerCase(),
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

  async update(currentUser: AuthenticatedUser, roleId: string, dto: UpdateRoleDto) {
    const role = await this.rolesRepository.findByIdAndTenant(
      currentUser.tenantId,
      roleId,
    );

    if (!role) {
      throw new NotFoundException('Role was not found for this tenant.');
    }

    if (role.isSystem) {
      throw new ForbiddenException(
        'System roles cannot be edited from tenant settings.',
      );
    }

    const duplicateRole = (await this.rolesRepository.findByTenant(currentUser.tenantId))
      .find(
        (existingRole) =>
          existingRole.id !== roleId &&
          existingRole.name.trim().toLowerCase() === dto.name.trim().toLowerCase(),
      );

    if (duplicateRole) {
      throw new ConflictException('Role name is already in use.');
    }

    const permissionIds = dto.permissionIds ?? role.rolePermissions.map((item) => item.permissionId);
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
      isSystem: role.isSystem,
      userCount: role.userRoles.length,
      permissionKeys: role.rolePermissions.map((item) => item.permission.key),
    };
  }
}
