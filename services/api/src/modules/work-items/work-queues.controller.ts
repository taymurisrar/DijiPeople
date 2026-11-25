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
import { CreateWorkQueueDto, UpdateWorkQueueDto } from './dto/work-queue.dto';
import { WorkItemsService } from './work-items.service';
import { WorkQueuesService } from './work-queues.service';

/*
 * Work queues (WP-06.S1). Reading needs `work-queues.read`; creating or changing
 * a queue needs `work-queues.manage`. A queue is deactivated, never deleted.
 */
@Controller('work-queues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkQueuesController {
  constructor(
    private readonly queues: WorkQueuesService,
    private readonly items: WorkItemsService,
  ) {}

  @Get()
  @Permissions('work-queues.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.queues.list(user, includeInactive === 'true');
  }

  @Get(':id/summary')
  @Permissions('work-queues.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.items.queueSummary(user, id);
  }

  @Post()
  @Permissions('work-queues.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkQueueDto,
  ) {
    return this.queues.create(user, dto);
  }

  @Patch(':id')
  @Permissions('work-queues.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkQueueDto,
  ) {
    return this.queues.update(user, id, dto);
  }
}
