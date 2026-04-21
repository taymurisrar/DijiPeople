import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('headcount-summary')
  @Permissions('employees.read')
  getHeadcountSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getHeadcountSummary(user.tenantId);
  }

  @Get('leave-summary')
  @Permissions('leave-requests.read')
  getLeaveSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getLeaveSummary(user.tenantId);
  }

  @Get('attendance-summary')
  @Permissions('attendance.read')
  getAttendanceSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getAttendanceSummary(user.tenantId);
  }

  @Get('recruitment-summary')
  @Permissions('recruitment.read')
  getRecruitmentSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getRecruitmentSummary(user.tenantId);
  }
}
