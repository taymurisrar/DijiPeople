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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.findByTenant(user.tenantId);
  }

  @Get(':roleId')
  @Permissions('roles.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.findByIdAndTenant(user.tenantId, roleId);
  }

  @Post()
  @Permissions('roles.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(user, dto);
  }

  @Put(':roleId')
  @Permissions('roles.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(user, roleId, dto);
  }

  @Put(':roleId/permissions')
  @Permissions('roles.assign-permissions')
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

  @Delete(':roleId')
  @Permissions('roles.update')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
  ) {
    return this.rolesService.remove(user, roleId);
  }
}
