import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  PlatformPermissionsGuard,
  RequirePlatformPermission,
} from '../platform-auth/platform-permissions';
import { PlatformAuditLogQueryDto } from './dto/platform-audit-log-query.dto';
import { AuditService } from './audit.service';

/*
 * BUG-3564. Every platform action writes a `PlatformAuditLog` row
 * (`AuditService.log` routes `tenantId: 'platform'` rows there); until now
 * nothing in the API read it back.
 *
 * Permission: `monitoring.read`, not a new key. It is the read permission
 * every audit-facing platform role already holds — READ_ONLY_AUDITOR,
 * SUPPORT_MANAGER, SUPPORT_AGENT, MONITORING_OPERATOR — plus PLATFORM_ADMIN,
 * PLATFORM_OPERATIONS and SUPER_ADMIN (`monitoring.*`/`platform.*`). BUG-3564
 * offered a new `audit.read` key granted to the same five roles as the
 * alternative; `monitoring.read` was chosen instead because it already exists,
 * already sits beside the rest of this monitoring area's routes, and already
 * covers the acceptance criteria (READ_ONLY_AUDITOR admitted, every
 * commercial/presales role refused) without a grant decision or a new
 * permission-catalog entry. `platform-audit-authorization.spec.ts` pins the
 * resulting role matrix directly.
 *
 * `@RequirePlatformPermission` is declared per handler rather than left to
 * `resolvePlatformPermission`'s path matching, the same way `SuperAdminController`
 * declares its narrow ADR-0018 keys: this controller is not one of the four
 * `platform-permissions.spec.ts` enumerates for full-route-coverage pinning,
 * so a path-derived guess would be untested rather than wrong, and a declared
 * permission is visible on the handler and unambiguous.
 */
@Controller('platform/audit-logs')
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
export class PlatformAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePlatformPermission('monitoring.read')
  list(@Query() query: PlatformAuditLogQueryDto) {
    return this.auditService.listPlatform(query);
  }

  @Get(':id')
  @RequirePlatformPermission('monitoring.read')
  detail(@Param('id') id: string) {
    return this.auditService.detailPlatform(id);
  }
}
