import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions('audit.read')
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  listAuditLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AuditLogQueryDto,
  ) {
    assertNotPlatformCaller(user);
    return this.auditService.listByTenant(user.tenantId, query);
  }

  @Get(':id')
  @Permissions('audit.read')
  @RequirePermission(ENTITY_KEYS.REPORTS, 'read')
  detailAuditLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    assertNotPlatformCaller(user);
    return this.auditService.detailByTenant(user.tenantId, id);
  }
}

/*
 * BUG-3564. A platform user's `tenantId` is the literal string `'platform'`.
 * `PermissionsGuard`'s elevated-role bypass (`hasElevatedTenantRole`) lets
 * SUPER_ADMIN/PLATFORM_OWNER straight through this tenant-scoped guard —
 * they carry the `system-admin` alias — and `listByTenant('platform', ...)`
 * then queried `AuditLog` for a tenant that does not exist and returned 200
 * with an empty page forever: every platform action is written to
 * `PlatformAuditLog` instead (see `AuditService.log`'s `tenantId === 'platform'`
 * branch). An empty page reads as "no audit history exists", which is the
 * wrong answer for the one role built to review it. Refuse explicitly and
 * name the real endpoint rather than let that silence look like evidence.
 * Every other platform role is already refused earlier, by the guard itself,
 * for lacking the tenant `audit.read` permission — this only closes the gap
 * for the roles the guard's bypass lets through.
 */
function assertNotPlatformCaller(user: AuthenticatedUser) {
  if (user.tenantId === 'platform') {
    throw new BadRequestException({
      code: 'PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT',
      message:
        'Platform audit history is not available here. Use GET /platform/audit-logs.',
    });
  }
}
