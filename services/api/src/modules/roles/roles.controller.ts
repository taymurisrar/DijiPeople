import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ENTITY_KEYS,
  MISC_PERMISSION_DEFINITIONS,
  RBAC_ENTITIES,
  RBAC_PRIVILEGES,
} from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleMatrixDto } from './dto/update-role-matrix.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles.read')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.findByTenant(user.tenantId);
  }

  @Get('matrix/catalog')
  @Permissions('roles.read')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  getMatrixCatalog() {
    return {
      entities: RBAC_ENTITIES,
      privileges: RBAC_PRIVILEGES,
      miscPermissions: MISC_PERMISSION_DEFINITIONS,
    };
  }

  @Get(':roleId')
  @Permissions('roles.read')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.findByIdAndTenant(user.tenantId, roleId);
  }

  @Post()
  @Permissions('roles.create')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(user, dto);
  }

  @Post(':roleId/clone')
  @Permissions('roles.create')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  clone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.clone(user, roleId);
  }

  @Put(':roleId')
  @Permissions('roles.update')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(user, roleId, dto);
  }

  @Put(':roleId/permissions')
  @Permissions('roles.assign-permissions')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  updatePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolesService.updatePermissions(
      user.tenantId,
      roleId,
      dto.permissionIds,
      user.userId,
    );
  }

  @Put(':roleId/matrix')
  @Permissions('roles.assign-permissions')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  updateMatrix(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleMatrixDto,
  ) {
    return this.rolesService.updateMatrix(user, roleId, dto);
  }

  @Post(':roleId/reset-default')
  @Permissions('roles.assign-permissions')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  resetSystemRoleMatrix(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.resetSystemRoleMatrix(user, roleId);
  }

  @Delete(':roleId')
  @Permissions('roles.update')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.remove(user, roleId);
  }

  @Put(':roleId/deactivate')
  @Permissions('roles.update')
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.deactivate(user, roleId);
  }
}
