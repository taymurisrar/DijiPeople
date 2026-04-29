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
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LinkUserEmployeeDto } from './dto/link-user-employee.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserBusinessUnitDto } from './dto/update-user-business-unit.dto';
import { UpdateUserPermissionsDto } from './dto/update-user-permissions.dto';
import { UsersService } from './users.service';

type DeleteUserResponse = {
  deleted: boolean;
  id: string;
};

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users.read')
  @RequirePermission(ENTITY_KEYS.USERS, 'read')
  findAll(@CurrentUser() currentUser: AuthenticatedUser): Promise<unknown> {
    return this.usersService.findByTenant(currentUser.tenantId, currentUser);
  }

  @Get('me')
  findMe(@CurrentUser() currentUser: AuthenticatedUser): Promise<unknown> {
    return this.usersService.findCurrentProfile(
      currentUser.tenantId,
      currentUser.userId,
    );
  }

  @Get(':userId')
  @Permissions('users.read')
  @RequirePermission(ENTITY_KEYS.USERS, 'read')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ): Promise<unknown> {
    return this.usersService.findOne(currentUser.tenantId, targetUserId);
  }

  @Post()
  @Permissions('users.create')
  @RequirePermission(ENTITY_KEYS.USERS, 'create')
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() createUserDto: CreateUserDto,
  ): Promise<unknown> {
    return this.usersService.create(
      currentUser.tenantId,
      createUserDto,
      currentUser.userId,
    );
  }

  @Put(':userId')
  @Permissions('users.update')
  @RequirePermission(ENTITY_KEYS.USERS, 'write')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<unknown> {
    return this.usersService.update(
      currentUser.tenantId,
      targetUserId,
      updateUserDto,
      currentUser.userId,
    );
  }

  @Post(':userId/link-employee')
  @Permissions('users.update')
  @RequirePermission(ENTITY_KEYS.USERS, 'assign')
  linkEmployee(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() dto: LinkUserEmployeeDto,
  ): Promise<unknown> {
    return this.usersService.linkEmployee(
      currentUser.tenantId,
      targetUserId,
      dto,
      currentUser.userId,
    );
  }

  @Delete(':userId/link-employee')
  @Permissions('users.update')
  @RequirePermission(ENTITY_KEYS.USERS, 'assign')
  unlinkEmployee(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ): Promise<unknown> {
    return this.usersService.unlinkEmployee(
      currentUser.tenantId,
      targetUserId,
      currentUser.userId,
    );
  }

  @Put(':userId/roles')
  @Permissions('users.assign-roles')
  @RequirePermission(ENTITY_KEYS.USERS, 'assign')
  assignRoles(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() assignUserRolesDto: AssignUserRolesDto,
  ): Promise<unknown> {
    return this.usersService.assignRoles(
      currentUser.tenantId,
      targetUserId,
      assignUserRolesDto.roleIds,
      currentUser.userId,
    );
  }

  @Put(':userId/permissions')
  @Permissions('users.update')
  @RequirePermission(ENTITY_KEYS.USERS, 'write')
  assignDirectPermissions(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() updateUserPermissionsDto: UpdateUserPermissionsDto,
  ): Promise<unknown> {
    return this.usersService.assignDirectPermissions(
      currentUser.tenantId,
      targetUserId,
      updateUserPermissionsDto.permissionIds,
      currentUser.userId,
    );
  }

  @Put(':userId/business-unit')
  @Permissions('users.update')
  @RequirePermission(ENTITY_KEYS.USERS, 'write')
  assignBusinessUnit(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() updateUserBusinessUnitDto: UpdateUserBusinessUnitDto,
  ): Promise<unknown> {
    return this.usersService.assignBusinessUnit(
      currentUser.tenantId,
      targetUserId,
      updateUserBusinessUnitDto.businessUnitId,
      currentUser.userId,
    );
  }

  @Delete(':userId')
  @Permissions('users.delete')
  @RequirePermission(ENTITY_KEYS.USERS, 'delete')
  remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ): Promise<DeleteUserResponse> {
    return this.usersService.remove(
      currentUser.tenantId,
      targetUserId,
      currentUser.userId,
    );
  }
}
