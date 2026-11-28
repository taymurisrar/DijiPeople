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
  RequireAnyPermission,
} from '../../common/decorators/permissions.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateWorkQueueDto, UpdateWorkQueueDto } from './dto/work-queue.dto';
import { WorkItemsService } from './work-items.service';
import { WorkQueuesService } from './work-queues.service';

/*
 * Work queues (WP-06.S1). Reading needs `work-queues.read`; creating or changing
 * a queue needs `work-queues.manage`. A queue is deactivated, never deleted.
 */
@Controller('work-queues')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.WORK_MANAGEMENT)
export class WorkQueuesController {
  constructor(
    private readonly queues: WorkQueuesService,
    private readonly items: WorkItemsService,
  ) {}

  @Get()
  @Permissions('work-queues.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'read' },
    { entityKey: ENTITY_KEYS.CUSTOMIZATION, action: 'read' },
  )
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.queues.list(user, includeInactive === 'true');
  }

  @Get(':id/summary')
  @Permissions('work-queues.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'read' },
    { entityKey: ENTITY_KEYS.CUSTOMIZATION, action: 'read' },
  )
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.items.queueSummary(user, id);
  }

  @Post()
  @Permissions('work-queues.manage')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'manage' },
    { entityKey: ENTITY_KEYS.CUSTOMIZATION, action: 'configure' },
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkQueueDto,
  ) {
    return this.queues.create(user, dto);
  }

  @Patch(':id')
  @Permissions('work-queues.manage')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'manage' },
    { entityKey: ENTITY_KEYS.CUSTOMIZATION, action: 'configure' },
  )
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkQueueDto,
  ) {
    return this.queues.update(user, id, dto);
  }
}
