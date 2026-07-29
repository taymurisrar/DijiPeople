import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamType } from '@prisma/client';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { RolesRepository } from '../roles/roles.repository';
import { UsersRepository } from '../users/users.repository';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { CreateTeamRoleDto } from './dto/create-team-role.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsRepository } from './teams.repository';

type TeamSummaryRecord =
  | Awaited<ReturnType<TeamsRepository['findByTenant']>>[number]
  | NonNullable<Awaited<ReturnType<TeamsRepository['findByIdAndTenant']>>>;

@Injectable()
export class TeamsService {
  constructor(
    private readonly teamsRepository: TeamsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly auditService: AuditService,
  ) {}

  findByTenant(
    tenantId: string,
    filters: {
      departmentId?: string;
      businessUnitId?: string;
      teamType?: TeamType;
    } = {},
  ) {
    return this.teamsRepository
      .findByTenant(tenantId, filters)
      .then((teams) => teams.map((team) => this.mapTeamSummary(team)));
  }

  async findOne(tenantId: string, teamId: string) {
    const team = await this.teamsRepository.findByIdAndTenant(tenantId, teamId);

    if (!team) {
      throw new NotFoundException('Team was not found for this tenant.');
    }

    return this.mapTeamSummary(team);
  }

  async create(currentUser: AuthenticatedUser, dto: CreateTeamDto) {
    const department = await this.resolveDepartmentBelongsToTenant(
      currentUser.tenantId,
      dto.departmentId,
      dto.businessUnitId,
    );
    const businessUnitId =
      dto.businessUnitId ?? department?.businessUnitId ?? undefined;

    await this.assertBusinessUnitBelongsToTenant(
      currentUser.tenantId,
      businessUnitId,
    );
    await this.assertUserBelongsToTenant(currentUser.tenantId, dto.ownerUserId);

    const key = this.normalizeTeamKey(dto.key ?? dto.name);
    const existing = (
      await this.teamsRepository.findByTenant(currentUser.tenantId)
    ).find((team) => team.key.toLowerCase() === key.toLowerCase());

    if (existing) {
      throw new ConflictException('Team key is already in use.');
    }

    const team = await this.teamsRepository.create({
      tenantId: currentUser.tenantId,
      name: dto.name.trim(),
      key,
      description: dto.description?.trim(),
      teamType: dto.teamType ?? TeamType.ACCESS,
      businessUnitId,
      departmentId: dto.departmentId,
      ownerUserId: dto.ownerUserId,
      isActive: dto.isActive ?? true,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_CREATED',
      entityType: 'Team',
      entityId: team.id,
      afterSnapshot: team,
    });

    return this.findOne(currentUser.tenantId, team.id);
  }

  async update(
    currentUser: AuthenticatedUser,
    teamId: string,
    dto: UpdateTeamDto,
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    const nextDepartmentId =
      dto.departmentId !== undefined ? dto.departmentId : team.departmentId;
    const department = await this.resolveDepartmentBelongsToTenant(
      currentUser.tenantId,
      nextDepartmentId,
      dto.businessUnitId ?? undefined,
    );
    const resolvedBusinessUnitId =
      dto.businessUnitId !== undefined
        ? dto.businessUnitId || null
        : dto.departmentId !== undefined
          ? (department?.businessUnitId ?? null)
          : undefined;

    await this.assertBusinessUnitBelongsToTenant(
      currentUser.tenantId,
      resolvedBusinessUnitId ?? undefined,
    );
    await this.assertUserBelongsToTenant(currentUser.tenantId, dto.ownerUserId);

    const updatedTeam = await this.teamsRepository.update(teamId, {
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.key ? { key: this.normalizeTeamKey(dto.key) } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.teamType ? { teamType: dto.teamType } : {}),
      ...(resolvedBusinessUnitId !== undefined
        ? { businessUnitId: resolvedBusinessUnitId }
        : {}),
      ...(dto.departmentId !== undefined
        ? { departmentId: dto.departmentId || null }
        : {}),
      ...(dto.ownerUserId !== undefined
        ? { ownerUserId: dto.ownerUserId || null }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      updatedById: currentUser.userId,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_UPDATED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: team,
      afterSnapshot: updatedTeam,
    });

    return this.findOne(currentUser.tenantId, updatedTeam.id);
  }

  async deactivate(currentUser: AuthenticatedUser, teamId: string) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);

    const updatedTeam = await this.teamsRepository.update(teamId, {
      isActive: false,
      updatedById: currentUser.userId,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_DEACTIVATED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: team,
      afterSnapshot: updatedTeam,
    });

    return this.findOne(currentUser.tenantId, updatedTeam.id);
  }

  async replaceMembers(
    currentUser: AuthenticatedUser,
    teamId: string,
    userIds: string[],
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    await this.assertUsersBelongToTenant(currentUser.tenantId, userIds);

    await this.teamsRepository.replaceMembers(
      currentUser.tenantId,
      teamId,
      userIds,
      currentUser.userId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_MEMBERS_UPDATED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: team.members,
      afterSnapshot: userIds,
    });

    return this.findByTenant(currentUser.tenantId);
  }

  async addMember(
    currentUser: AuthenticatedUser,
    teamId: string,
    dto: CreateTeamMemberDto,
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    await this.assertUsersBelongToTenant(currentUser.tenantId, [dto.userId]);

    const member = await this.teamsRepository.addMember(
      currentUser.tenantId,
      teamId,
      dto.userId,
      currentUser.userId,
      dto.isOwner ?? false,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_MEMBER_ADDED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: team.members,
      afterSnapshot: member,
    });

    return this.mapTeamMember(
      await this.teamsRepository.findMemberById(
        currentUser.tenantId,
        teamId,
        member.id,
      ),
    );
  }

  async updateMember(
    currentUser: AuthenticatedUser,
    teamId: string,
    memberId: string,
    dto: UpdateTeamMemberDto,
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    const member = await this.teamsRepository.findMemberById(
      currentUser.tenantId,
      teamId,
      memberId,
    );

    if (!member) {
      throw new NotFoundException('Team member was not found for this team.');
    }

    await this.teamsRepository.updateMember(memberId, {
      ...(dto.isOwner !== undefined ? { isOwner: dto.isOwner } : {}),
      updatedById: currentUser.userId,
    });

    const updatedMember = await this.teamsRepository.findMemberById(
      currentUser.tenantId,
      teamId,
      memberId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_MEMBER_UPDATED',
      entityType: 'Team',
      entityId: team.id,
      beforeSnapshot: member,
      afterSnapshot: updatedMember,
    });

    return this.mapTeamMember(updatedMember);
  }

  async removeMember(
    currentUser: AuthenticatedUser,
    teamId: string,
    memberId: string,
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    const member = await this.teamsRepository.findMemberById(
      currentUser.tenantId,
      teamId,
      memberId,
    );

    if (!member) {
      throw new NotFoundException('Team member was not found for this team.');
    }

    await this.teamsRepository.deleteMember(memberId);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_MEMBER_REMOVED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: member,
      afterSnapshot: team.members.filter((item) => item.id !== memberId),
    });
  }

  async replaceRoles(
    currentUser: AuthenticatedUser,
    teamId: string,
    roleIds: string[],
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    await this.assertRolesAssignable(currentUser, roleIds);

    await this.teamsRepository.replaceRoles(
      currentUser.tenantId,
      teamId,
      roleIds,
      currentUser.userId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_ROLES_UPDATED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: team.teamRoles,
      afterSnapshot: roleIds,
    });

    return this.findByTenant(currentUser.tenantId);
  }

  async addRole(
    currentUser: AuthenticatedUser,
    teamId: string,
    dto: CreateTeamRoleDto,
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    await this.assertRolesAssignable(currentUser, [dto.roleId]);

    const assignment = await this.teamsRepository.addRole(
      currentUser.tenantId,
      teamId,
      dto.roleId,
      currentUser.userId,
    );

    const mappedAssignment = await this.teamsRepository.findRoleAssignmentById(
      currentUser.tenantId,
      teamId,
      assignment.id,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_ROLE_ADDED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: team.teamRoles,
      afterSnapshot: mappedAssignment,
    });

    return this.mapTeamRole(mappedAssignment);
  }

  async removeRole(
    currentUser: AuthenticatedUser,
    teamId: string,
    assignmentId: string,
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
    const assignment = await this.teamsRepository.findRoleAssignmentById(
      currentUser.tenantId,
      teamId,
      assignmentId,
    );

    if (!assignment) {
      throw new NotFoundException('Team role assignment was not found.');
    }

    await this.teamsRepository.deleteRoleAssignment(assignmentId);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TEAM_ROLE_REMOVED',
      entityType: 'Team',
      entityId: teamId,
      beforeSnapshot: assignment,
      afterSnapshot: team.teamRoles.filter((item) => item.id !== assignmentId),
    });
  }

  private mapTeamSummary(team: TeamSummaryRecord | null) {
    if (!team) return null;

    return {
      ...team,
      accessTeamName: team.name,
      teamName: team.name,
      businessUnitName: team.businessUnit?.name ?? null,
      departmentName: team.department?.name ?? null,
      ownerName: team.ownerUser
        ? `${team.ownerUser.firstName} ${team.ownerUser.lastName}`.trim()
        : null,
      membersCount: team._count?.members ?? team.members.length,
      rolesCount: team._count?.teamRoles ?? team.teamRoles.length,
      employeesCount: team._count?.employees ?? 0,
      modifiedOn: team.updatedAt,
    };
  }

  private mapTeamMember(
    member: Awaited<ReturnType<TeamsRepository['findMemberById']>>,
  ) {
    if (!member) return null;

    return {
      ...member,
      userName: `${member.user.firstName} ${member.user.lastName}`.trim(),
      userEmail: member.user.email,
      joinedOn: member.createdAt,
    };
  }

  private mapTeamRole(
    assignment: Awaited<ReturnType<TeamsRepository['findRoleAssignmentById']>>,
  ) {
    if (!assignment) return null;

    return {
      ...assignment,
      roleName: assignment.role.name,
      roleKey: assignment.role.key,
      roleDescription: assignment.role.description,
      accessLevel: assignment.role.accessLevel,
      assignedOn: assignment.createdAt,
    };
  }

  private async findMutableTeam(tenantId: string, teamId: string) {
    const team = await this.teamsRepository.findByIdAndTenant(tenantId, teamId);

    if (!team) {
      throw new NotFoundException('Team was not found for this tenant.');
    }

    if (team.isSystem) {
      throw new ForbiddenException('System teams cannot be modified here.');
    }

    return team;
  }

  private async assertBusinessUnitBelongsToTenant(
    tenantId: string,
    businessUnitId?: string,
  ) {
    if (!businessUnitId) {
      return;
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
  }

  private async resolveDepartmentBelongsToTenant(
    tenantId: string,
    departmentId?: string | null,
    businessUnitId?: string | null,
  ) {
    if (!departmentId) return null;

    const department = await this.teamsRepository.findDepartmentById(
      tenantId,
      departmentId,
    );

    if (!department) {
      throw new BadRequestException('Department must belong to this tenant.');
    }

    if (businessUnitId && department.businessUnitId !== businessUnitId) {
      throw new BadRequestException(
        'Team department must belong to the selected business unit.',
      );
    }

    return department;
  }

  private async assertUserBelongsToTenant(tenantId: string, userId?: string) {
    if (!userId) {
      return;
    }

    await this.assertUsersBelongToTenant(tenantId, [userId]);
  }

  private async assertUsersBelongToTenant(tenantId: string, userIds: string[]) {
    if (userIds.length === 0) {
      return;
    }

    const users = await Promise.all(
      userIds.map((userId) => this.usersRepository.findByIdWithAccess(userId)),
    );

    if (users.some((user) => !user || user.tenantId !== tenantId)) {
      throw new BadRequestException(
        'One or more users do not belong to this tenant.',
      );
    }
  }

  private async assertRolesAssignable(
    currentUser: AuthenticatedUser,
    roleIds: string[],
  ) {
    const roles = await this.rolesRepository.findByIds(
      currentUser.tenantId,
      roleIds,
    );

    if (roles.length !== roleIds.length) {
      throw new BadRequestException(
        'One or more roles do not belong to this tenant.',
      );
    }

    if (roles.some((role) => !role.isActive)) {
      throw new BadRequestException(
        'Inactive roles cannot be assigned to teams.',
      );
    }

    if (roles.some((role) => role.key === ROLE_KEYS.GLOBAL_ADMIN)) {
      throw new ForbiddenException(
        'Global Administrator can only be assigned directly to the tenant owner.',
      );
    }

    const canAssignSystemRoles =
      currentUser.accessContext?.isTenantOwner ||
      currentUser.accessContext?.isSystemAdministrator;

    if (!canAssignSystemRoles && roles.some((role) => role.isSystem)) {
      throw new ForbiddenException(
        'Only tenant owners and system administrators can assign system roles.',
      );
    }
  }

  private normalizeTeamKey(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
