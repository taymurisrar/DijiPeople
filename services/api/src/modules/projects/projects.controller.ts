import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AssignProjectEmployeeDto } from './dto/assign-project-employee.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';
import { AuditService } from '../audit/audit.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PROJECTS)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions('projects.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProjectQueryDto,
  ) {
    return this.projectsService.findByTenant(user, query);
  }

  @Get('assigned/me')
  @Permissions('projects.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  findAssignedToCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAssignedProjectsForCurrentUser(user);
  }

  @Get(':projectId')
  @Permissions('projects.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.projectsService.findByIdForUser(user, projectId);
  }

  @Get(':projectId/timeline')
  @Permissions('projects.read', 'timeline.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  async getTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    await this.projectsService.findByIdForUser(user, projectId);
    return this.auditService.listRecordTimeline({
      tenantId: user.tenantId,
      entityType: 'Project',
      entityId: projectId,
      recordHref: `/projects/${projectId}`,
    });
  }

  @Post()
  @Permissions('projects.create')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(user, dto);
  }

  @Patch(':projectId')
  @Permissions('projects.update')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user, projectId, dto);
  }

  @Post(':projectId/assignments')
  @Permissions('projects.assign')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'assign')
  assignEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: AssignProjectEmployeeDto,
  ) {
    return this.projectsService.assignEmployee(user, projectId, dto);
  }

  @Get(':projectId/assignments')
  @Permissions('projects.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.projectsService.listAssignments(user, projectId);
  }

  @Delete(':projectId/assignments/:assignmentId')
  @Permissions('projects.assign')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'assign')
  removeAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.projectsService.removeAssignment(user, projectId, assignmentId);
  }

  @Post(':projectId/resources')
  @Permissions('projects.assign')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'assign')
  assignResource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: AssignProjectEmployeeDto,
  ) {
    return this.projectsService.assignEmployee(user, projectId, dto);
  }

  @Get(':projectId/timesheets')
  @Permissions('projects.read')
  @RequirePermission(ENTITY_KEYS.PROJECTS, 'read')
  findProjectTimesheets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.projectsService.findProjectTimesheets(user.tenantId, projectId);
  }
}
