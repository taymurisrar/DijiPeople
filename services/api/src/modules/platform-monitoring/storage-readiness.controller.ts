import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import { StorageService } from '../../common/storage/storage.service';

/**
 * An operational check that object storage is actually reachable.
 *
 * Deliberately NOT part of `GET /health`. That route is public and is polled
 * constantly by the platform, and making every poll perform a bucket operation
 * would both cost money and hand an unauthenticated caller a way to probe our
 * storage dependency. This route is behind the same platform-monitoring
 * permission as the log viewer, so an operator can answer "is R2 up?" during an
 * incident without exposing that surface to the internet.
 *
 * The response deliberately names no bucket, endpoint, key or credential — only
 * whether the store answered and how quickly.
 */
@Controller('platform/storage')
@UseGuards(JwtAuthGuard)
export class StorageReadinessController {
  constructor(private readonly storage: StorageService) {}

  @Get('readiness')
  async readiness(@CurrentUser() user: AuthenticatedUser) {
    if (
      !user.platform?.id ||
      !userHasPlatformPermission(user, 'monitoring.read')
    ) {
      throw new ForbiddenException({
        code: 'PLATFORM_MONITORING_PERMISSION_REQUIRED',
        message: 'Platform monitoring read access is required.',
      });
    }

    const readiness = await this.storage.checkReadiness();

    return {
      provider: readiness.provider,
      ready: readiness.ready,
      detail: readiness.detail,
      latencyMs: readiness.latencyMs,
      // Worth surfacing on its own: a production instance reporting `local`
      // means uploads are landing on an ephemeral disk, which is the exact
      // condition FILE-01 described. The provider name is not sensitive; the
      // bucket it points at is, and is not included.
      durable: readiness.provider !== 'local',
    };
  }
}
