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
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreateAssignmentDto,
  CreateWorkProfileDto,
  CreateWorkUnitDto,
  EndAssignmentDto,
  ListAssignmentsDto,
  ListWorkProfilesDto,
  PublishWorkProfileVersionDto,
  UpdateWorkProfileDto,
  UpdateWorkProfileVersionDto,
  UpdateWorkUnitDto,
} from './dto/work-profile.dto';
import { WorkProfilesService } from './work-profiles.service';

/*
 * Work profiles: configuration of what roles do and how it is measured. Reading
 * the catalogue needs `work-profiles.read`; changing anything, and reading who
 * holds a profile (employee ids), needs `work-profiles.manage`. Nothing here
 * deletes: units and profiles are deactivated, versions are published and never
 * edited, assignments are ended (ADR-0030).
 *
 * Route order matters: the literal `units` and `assignments` segments are declared
 * before `:id` so they are never captured as a profile id.
 */
@Controller('work-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkProfilesController {
  constructor(private readonly service: WorkProfilesService) {}

  // ---------------------------------------------------------------- units

  @Get('units')
  @Permissions('work-profiles.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  listUnits(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listUnits(user.tenantId);
  }

  @Post('units')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  createUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkUnitDto,
  ) {
    return this.service.createUnit(user, dto);
  }

  @Patch('units/:id')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  updateUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkUnitDto,
  ) {
    return this.service.updateUnit(user, id, dto);
  }

  // ---------------------------------------------------------- assignments

  @Get('assignments')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAssignmentsDto,
  ) {
    return this.service.listAssignments(user.tenantId, query);
  }

  @Post('assignments')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.service.assign(user, dto);
  }

  @Patch('assignments/:id/end')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  endAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EndAssignmentDto,
  ) {
    return this.service.endAssignment(user, id, dto);
  }

  // ------------------------------------------------------------- profiles

  @Get()
  @Permissions('work-profiles.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkProfilesDto,
  ) {
    return this.service.list(user.tenantId, query);
  }

  @Post()
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkProfileDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @Permissions('work-profiles.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkProfileDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/versions')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.createDraft(user, id);
  }

  @Patch(':id/versions/:versionId')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() dto: UpdateWorkProfileVersionDto,
  ) {
    return this.service.updateDraft(user, id, versionId, dto);
  }

  @Post(':id/versions/:versionId/publish')
  @Permissions('work-profiles.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
    @Body() dto: PublishWorkProfileVersionDto,
  ) {
    return this.service.publish(user, id, versionId, dto);
  }
}
