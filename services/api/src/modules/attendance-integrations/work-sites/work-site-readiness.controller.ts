import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface';
import { WorkSiteReadinessService } from './work-site-readiness.service';

/**
 * Read-only operational context for a single work site.
 *
 * Gated on `locations.read` because that is the permission that already governs
 * the Work Site record this describes; it exposes no device secret, no gateway
 * credential and no employee-identifying attendance data — only counts, names
 * and health states an administrator configuring the site must be able to see.
 */
@Controller('integrations/attendance/work-sites')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkSiteReadinessController {
  constructor(private readonly service: WorkSiteReadinessService) {}

  @Get(':id/readiness')
  @Permissions('locations.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  getReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getReadiness(user.tenantId, id);
  }
}
