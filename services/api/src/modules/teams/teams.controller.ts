import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Post,
  Query,
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
import { TeamType } from '@prisma/client';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { CreateTeamRoleDto } from './dto/create-team-role.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { UpdateTeamMembersDto } from './dto/update-team-members.dto';
import { UpdateTeamRolesDto } from './dto/update-team-roles.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @Permissions('teams.read')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'read')
  findAll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('departmentId') departmentId?: string,
    @Query('businessUnitId') businessUnitId?: string,
    @Query('teamType') teamType?: TeamType,
  ) {
    return this.teamsService.findByTenant(currentUser.tenantId, {
      departmentId,
      businessUnitId,
      teamType,
    });
  }

  @Get(':teamId')
  @Permissions('teams.read')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'read')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teamsService.findOne(currentUser.tenantId, teamId);
  }

  @Post()
  @Permissions('teams.create')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'create')
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create(currentUser, dto);
  }

  @Patch(':teamId')
  @Permissions('teams.update')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'write')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(currentUser, teamId, dto);
  }

  @Put(':teamId/members')
  @Permissions('teams.members.manage')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'assign')
  replaceMembers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamMembersDto,
  ) {
    return this.teamsService.replaceMembers(currentUser, teamId, dto.userIds);
  }

  @Post(':teamId/members')
  @Permissions('teams.members.manage')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'assign')
  addMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamMemberDto,
  ) {
    return this.teamsService.addMember(currentUser, teamId, dto);
  }

  @Patch(':teamId/members/:memberId')
  @Permissions('teams.members.manage')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'assign')
  updateMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamsService.updateMember(currentUser, teamId, memberId, dto);
  }

  @Delete(':teamId/members/:memberId')
  @Permissions('teams.members.manage')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'assign')
  removeMember(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.teamsService.removeMember(currentUser, teamId, memberId);
  }

  @Put(':teamId/roles')
  @Permissions('teams.members.manage')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'assign')
  replaceRoles(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamRolesDto,
  ) {
    return this.teamsService.replaceRoles(currentUser, teamId, dto.roleIds);
  }

  @Post(':teamId/roles')
  @Permissions('teams.members.manage')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'assign')
  addRole(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamRoleDto,
  ) {
    return this.teamsService.addRole(currentUser, teamId, dto);
  }

  @Delete(':teamId/roles/:assignmentId')
  @Permissions('teams.members.manage')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'assign')
  removeRole(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.teamsService.removeRole(currentUser, teamId, assignmentId);
  }

  @Delete(':teamId')
  @Permissions('teams.delete')
  @RequirePermission(ENTITY_KEYS.TEAMS, 'delete')
  deactivate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teamsService.deactivate(currentUser, teamId);
  }
}
