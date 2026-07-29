import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { RunTimesheetJobDto } from './dto/timesheet-job.dto';
import { TimesheetJobsService } from './timesheet-jobs.service';

@Controller('timesheet-jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimesheetJobsController {
  constructor(private readonly jobs: TimesheetJobsService) {}

  @Get()
  @Permissions('timesheets.settings.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.jobs.list(user);
  }

  @Post('run')
  @Permissions('timesheets.jobs.run')
  run(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunTimesheetJobDto) {
    return this.jobs.run(user, dto);
  }
}
