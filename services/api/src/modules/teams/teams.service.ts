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
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsRepository } from './teams.repository';

@Injectable()
export class TeamsService {
  constructor(
    private readonly teamsRepository: TeamsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly auditService: AuditService,
  ) {}

  findByTenant(tenantId: string) {
    return this.teamsRepository.findByTenant(tenantId);
  }

  async findOne(tenantId: string, teamId: string) {
    const team = await this.teamsRepository.findByIdAndTenant(tenantId, teamId);

    if (!team) {
      throw new NotFoundException('Team was not found for this tenant.');
    }

    return team;
  }

  async create(currentUser: AuthenticatedUser, dto: CreateTeamDto) {
    await this.assertBusinessUnitBelongsToTenant(
      currentUser.tenantId,
      dto.businessUnitId,
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
      businessUnitId: dto.businessUnitId,
      ownerUserId: dto.ownerUserId,
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

    await this.assertBusinessUnitBelongsToTenant(
      currentUser.tenantId,
      dto.businessUnitId,
    );
    await this.assertUserBelongsToTenant(currentUser.tenantId, dto.ownerUserId);

    const updatedTeam = await this.teamsRepository.update(teamId, {
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.key ? { key: this.normalizeTeamKey(dto.key) } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.teamType ? { teamType: dto.teamType } : {}),
      ...(dto.businessUnitId !== undefined
        ? { businessUnitId: dto.businessUnitId || null }
        : {}),
      ...(dto.ownerUserId !== undefined
        ? { ownerUserId: dto.ownerUserId || null }
        : {}),
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

    return this.teamsRepository.findByTenant(currentUser.tenantId);
  }

  async replaceRoles(
    currentUser: AuthenticatedUser,
    teamId: string,
    roleIds: string[],
  ) {
    const team = await this.findMutableTeam(currentUser.tenantId, teamId);
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

    return this.teamsRepository.findByTenant(currentUser.tenantId);
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

  private normalizeTeamKey(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
