import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  AddDependencyDto,
  CreateWorkItemDto,
  ListWorkItemsDto,
  MoveQueueDto,
  ProgressQueryDto,
  SetMilestoneDto,
  WorkloadQueryDto,
  ReassignWorkItemDto,
  SetContributorDto,
  TransitionWorkItemDto,
  UpdateWorkItemDto,
} from './dto/work-item.dto';
import { WorkItemsService } from './work-items.service';

/*
 * Work items (ADR-0030). Reading needs `work-items.read`; every change needs
 * `work-items.write`. Nothing deletes a work item: it is archived.
 */
@Controller('work-items')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.WORK_MANAGEMENT)
export class WorkItemsController {
  constructor(private readonly service: WorkItemsService) {}

  @Get()
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkItemsDto,
  ) {
    return this.service.list(user, query);
  }

  @Post()
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkItemDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get('progress')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  progress(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProgressQueryDto,
  ) {
    return this.service.progress(user, query);
  }

  @Get('workload')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  workload(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkloadQueryDto,
  ) {
    return this.service.workload(user, query);
  }

  @Get(':id')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Patch(':id')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkItemDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/transition')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TransitionWorkItemDto,
  ) {
    return this.service.transition(user, id, dto);
  }

  @Post(':id/reassign')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReassignWorkItemDto,
  ) {
    return this.service.reassign(user, id, dto);
  }

  @Get(':id/hours')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  hours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.hours(user, id);
  }

  @Get(':id/owner-history')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  ownerHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.ownerHistory(user, id);
  }

  @Post(':id/claim')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.claim(user, id);
  }

  @Post(':id/milestone')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  setMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetMilestoneDto,
  ) {
    return this.service.setMilestone(user, id, dto);
  }

  @Post(':id/queue')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  moveToQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MoveQueueDto,
  ) {
    return this.service.moveToQueue(user, id, dto);
  }

  @Post(':id/archive')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.archive(user, id);
  }

  @Post(':id/unarchive')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  unarchive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.unarchive(user, id);
  }

  @Put(':id/contributors/:employeeId')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  setContributor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: SetContributorDto,
  ) {
    return this.service.setContributor(user, id, employeeId, dto);
  }

  @Delete(':id/contributors/:employeeId')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  removeContributor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.service.removeContributor(user, id, employeeId);
  }

  @Post(':id/dependencies')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  addDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddDependencyDto,
  ) {
    return this.service.addDependency(user, id, dto);
  }

  @Delete(':id/dependencies/:dependsOnId')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  removeDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('dependsOnId', new ParseUUIDPipe()) dependsOnId: string,
  ) {
    return this.service.removeDependency(user, id, dependsOnId);
  }
}
