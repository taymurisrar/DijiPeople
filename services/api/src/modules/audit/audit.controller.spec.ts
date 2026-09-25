import { BadRequestException } from '@nestjs/common';
import { AuditController } from './audit.controller';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

/*
 * BUG-3564. A platform user's `tenantId` is the literal string `'platform'`.
 * `listByTenant('platform', ...)` used to be reachable (for SUPER_ADMIN/
 * PLATFORM_OWNER, who pass `PermissionsGuard`'s elevated-role bypass) and
 * silently returned 200 with an empty page, because every platform action is
 * written to `PlatformAuditLog`, not `AuditLog`. This pins the explicit
 * refusal that replaced the silent empty page, and that ordinary tenant
 * behaviour is untouched.
 */
function tenantUser(): AuthenticatedUser {
  return {
    userId: 'tenant-user-1',
    tenantId: 'tenant-a',
    email: 'hr@tenant-a.test',
    roleIds: [],
    roleKeys: [],
    permissionKeys: ['audit.read'],
    rolePrivileges: [],
  } as unknown as AuthenticatedUser;
}

function platformUser(): AuthenticatedUser {
  return {
    userId: 'platform-user-1',
    tenantId: 'platform',
    email: 'admin@dijipeople.test',
    roleIds: [],
    roleKeys: ['system-admin'],
    permissionKeys: [],
    rolePrivileges: [],
    platform: { id: 'platform-user-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  } as unknown as AuthenticatedUser;
}

describe('AuditController refuses a platform caller instead of answering with an empty page', () => {
  function buildController() {
    const auditService = {
      listByTenant: jest.fn(async () => ({
        items: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        filters: { actions: [], entityTypes: [], actors: [] },
      })),
      detailByTenant: jest.fn(async () => ({ id: 'audit-1' })),
    };
    const controller = new AuditController(auditService as never);
    return { controller, auditService };
  }

  it('throws a clear, actionable error for a platform caller on the list route', () => {
    const { controller, auditService } = buildController();

    expect(() =>
      controller.listAuditLogs(platformUser(), new AuditLogQueryDto()),
    ).toThrow(BadRequestException);
    expect(auditService.listByTenant).not.toHaveBeenCalled();
  });

  it('throws the same way for the detail route', () => {
    const { controller, auditService } = buildController();

    expect(() => controller.detailAuditLog(platformUser(), 'audit-1')).toThrow(
      BadRequestException,
    );
    expect(auditService.detailByTenant).not.toHaveBeenCalled();
  });

  it('names the dedicated endpoint in the error, not a generic message', () => {
    const { controller } = buildController();

    try {
      void controller.listAuditLogs(platformUser(), new AuditLogQueryDto());
      throw new Error('expected listAuditLogs to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        code?: string;
      };
      expect(response.code).toBe('PLATFORM_AUDIT_TRAIL_USE_DEDICATED_ENDPOINT');
    }
  });

  it('leaves an ordinary tenant caller unchanged', async () => {
    const { controller, auditService } = buildController();
    const query = new AuditLogQueryDto();

    await controller.listAuditLogs(tenantUser(), query);
    await controller.detailAuditLog(tenantUser(), 'audit-1');

    expect(auditService.listByTenant).toHaveBeenCalledWith('tenant-a', query);
    expect(auditService.detailByTenant).toHaveBeenCalledWith(
      'tenant-a',
      'audit-1',
    );
  });
});
