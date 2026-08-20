import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getSummary(user);
  }

  @Get('views/:viewKey')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  async getView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('viewKey') viewKey: string,
  ) {
    if (
      !['admin', 'hr', 'manager', 'employee', 'executive'].includes(viewKey)
    ) {
      throw new NotFoundException('Dashboard view was not found.');
    }
    const result = await this.dashboardService.getView(
      user,
      viewKey as 'admin' | 'hr' | 'manager' | 'employee' | 'executive',
    );
    if (result.views.length === 0) {
      throw new ForbiddenException(
        'Dashboard view is not available for this account.',
      );
    }
    return result;
  }
}
