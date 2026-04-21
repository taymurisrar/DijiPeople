import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AssignProjectEmployeeDto } from './dto/assign-project-employee.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @Permissions('projects.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProjectQueryDto,
  ) {
    return this.projectsService.findByTenant(user.tenantId, query);
  }

  @Get('assigned/me')
  @Permissions('projects.read')
  findAssignedToCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAssignedProjectsForCurrentUser(user);
  }

  @Get(':projectId')
  @Permissions('projects.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.projectsService.findById(user.tenantId, projectId);
  }

  @Post()
  @Permissions('projects.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(user, dto);
  }

  @Patch(':projectId')
  @Permissions('projects.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user, projectId, dto);
  }

  @Post(':projectId/assignments')
  @Permissions('projects.assign')
  assignEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: AssignProjectEmployeeDto,
  ) {
    return this.projectsService.assignEmployee(user, projectId, dto);
  }
}
