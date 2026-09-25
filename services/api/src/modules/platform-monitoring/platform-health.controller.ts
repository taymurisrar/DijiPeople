import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import { PlatformHealthService } from './platform-health.service';

/**
 * TASK-0032 WP-06. `platform/monitoring` is not one of the prefixes
 * `resolvePlatformPermission` maps (that resolver only feeds
 * `PlatformPermissionsGuard`, used by the `super-admin`/`platform-settings`/
 * `billing` routes), so this follows the same pattern the sibling
 * `PlatformMonitoringController` and `StorageReadinessController` already use
 * in this module: `JwtAuthGuard` for authentication, and an explicit
 * `monitoring.read` permission check inside the handler. No change to
 * `resolvePlatformPermission` or the permission catalog was needed.
 */
@Controller('platform/monitoring')
@UseGuards(JwtAuthGuard)
export class PlatformHealthController {
  constructor(private readonly platformHealthService: PlatformHealthService) {}

  @Get('health')
  getHealth(@CurrentUser() user: AuthenticatedUser) {
    if (
      !user.platform?.id ||
      !userHasPlatformPermission(user, 'monitoring.read')
    ) {
      throw new ForbiddenException({
        code: 'PLATFORM_MONITORING_PERMISSION_REQUIRED',
        message: 'Platform monitoring read access is required.',
      });
    }

    return this.platformHealthService.getHealth();
  }
}
