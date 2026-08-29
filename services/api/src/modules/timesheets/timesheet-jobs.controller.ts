import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
import { RunTimesheetJobDto } from './dto/timesheet-job.dto';
import { TimesheetJobsService } from './timesheet-jobs.service';

@Controller('timesheet-jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.TIMESHEETS)
export class TimesheetJobsController {
  constructor(private readonly jobs: TimesheetJobsService) {}

  @Get()
  @Permissions('timesheets.settings.read')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.jobs.list(user);
  }

  @Post('run')
  @Permissions('timesheets.jobs.run')
  @RequirePermission(ENTITY_KEYS.TIMESHEETS, 'manage')
  run(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunTimesheetJobDto) {
    return this.jobs.run(user, dto);
  }
}
