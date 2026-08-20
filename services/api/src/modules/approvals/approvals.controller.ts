import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ApprovalsService } from './approvals.service';

@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.approvalsService.list(user, query);
  }

  @Get(':id')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvalsService.detail(user, id);
  }
}
