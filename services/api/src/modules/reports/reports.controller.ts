import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
  RequireAnyPermission,
} from '../../common/decorators/permissions.decorator';
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
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.EMPLOYEES, action: 'read' },
    { entityKey: ENTITY_KEYS.REPORTS, action: 'read' },
  )
  getHeadcountSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getHeadcountSummary(user.tenantId);
  }

  @Get('leave-summary')
  @Permissions('leave-requests.read')
  @RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'read')
  getLeaveSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getLeaveSummary(user.tenantId);
  }

  @Get('attendance-summary')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  getAttendanceSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getAttendanceSummary(user.tenantId);
  }

  @Get('recruitment-summary')
  @Permissions('recruitment.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'read' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'read' },
  )
  getRecruitmentSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getRecruitmentSummary(user.tenantId);
  }
}
