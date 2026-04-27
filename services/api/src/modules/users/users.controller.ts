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
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPermissionsDto } from './dto/update-user-permissions.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findByTenant(user.tenantId);
  }

  @Post()
  @Permissions('users.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.tenantId, dto, user.userId);
  }

  @Get('me')
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findCurrentProfile(user.tenantId, user.userId);
  }

  @Put(':userId/roles')
  @Permissions('users.assign-roles')
  assignRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AssignUserRolesDto,
  ) {
    return this.usersService.assignRoles(
      user.tenantId,
      userId,
      dto.roleIds,
      user.userId,
    );
  }

  @Put(':userId/permissions')
  @Permissions('users.update')
  assignDirectPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserPermissionsDto,
  ) {
    return this.usersService.assignDirectPermissions(
      user.tenantId,
      userId,
      dto.permissionIds,
      user.userId,
    );
  }

  @Delete(':userId')
  @Permissions('users.delete')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    return this.usersService.remove(user.tenantId, userId, user.userId);
  }
}
