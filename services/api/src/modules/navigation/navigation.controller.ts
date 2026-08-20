import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { UpdateSidebarNavigationDto } from './dto/sidebar-navigation.dto';
import { NavigationService } from './navigation.service';

@Controller('navigation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NavigationController {
  constructor(private readonly navigationService: NavigationService) {}

  /*
   * Deliberately open to every authenticated user: the sidebar renders for
   * everyone, so everyone needs the overrides that shape it. The response only
   * describes navigation for the caller's own tenant and grants no access —
   * hiding an entry never substitutes for the permission checks behind it.
   */
  @Get('sidebar')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  getSidebar(@CurrentUser() user: AuthenticatedUser) {
    return this.navigationService.getSidebarOverrides(user.tenantId);
  }

  @Put('sidebar')
  /*
   * `customization.modules.manage` is used rather than inventing a navigation
   * permission: it already exists, is already seeded, and is already held by
   * system-admin, system-customizer and global-admin. A new key would need a
   * grant of its own, and an ungranted key guards nothing while looking as if
   * it does.
   */
  @Permissions('customization.modules.manage')
  @RequirePermission(ENTITY_KEYS.CUSTOMIZATION, 'manage')
  updateSidebar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSidebarNavigationDto,
  ) {
    return this.navigationService.replaceSidebarOverrides(
      user.tenantId,
      user.userId,
      dto.items,
    );
  }
}
