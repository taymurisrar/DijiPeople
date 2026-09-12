import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  ENTITY_KEYS,
  MISC_PERMISSION_KEYS,
} from '../../common/constants/rbac-matrix';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { BillingController } from './controllers/billing.controller';

const guard = new PermissionsGuard(new Reflector());

function user(
  permissionKeys: string[],
  privilege?: SecurityPrivilege,
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-a',
    roleIds: [],
    roleKeys: ['custom-billing-role'],
    permissionKeys,
    rolePrivileges: privilege
      ? [
          {
            entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION,
            privilege,
            accessLevel: SecurityAccessLevel.TENANT,
          },
        ]
      : [],
  };
}

function context(
  handler: keyof BillingController,
  actor: AuthenticatedUser,
): ExecutionContext {
  return {
    getHandler: () => BillingController.prototype[handler],
    getClass: () => BillingController,
    switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
  } as unknown as ExecutionContext;
}

describe('BillingController capability authorization', () => {
  it('allows invoice reads only with billing view and matrix read', () => {
    expect(
      guard.canActivate(
        context(
          'getInvoices',
          user([MISC_PERMISSION_KEYS.BILLING_VIEW], SecurityPrivilege.READ),
        ),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        context('getInvoices', user([MISC_PERMISSION_KEYS.BILLING_VIEW])),
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not let billing view authorize subscription mutations', () => {
    expect(() =>
      guard.canActivate(
        context(
          'reconcileSubscription',
          user([MISC_PERMISSION_KEYS.BILLING_VIEW], SecurityPrivilege.READ),
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows a billing manager with both write axes', () => {
    expect(
      guard.canActivate(
        context(
          'reconcileSubscription',
          user([MISC_PERMISSION_KEYS.BILLING_MANAGE], SecurityPrivilege.MANAGE),
        ),
      ),
    ).toBe(true);
  });

  /*
   * BUG-3330's seat quote and EXECPLAN-0037's plan-change endpoints are new
   * reads/writes on the same tenant billing surface, gated the same way as
   * every other row in this table.
   */
  it.each(['getSeatQuote' as const, 'previewPlanChange' as const])(
    'allows %s read only with billing view and matrix read',
    (handler) => {
      expect(
        guard.canActivate(
          context(
            handler,
            user([MISC_PERMISSION_KEYS.BILLING_VIEW], SecurityPrivilege.READ),
          ),
        ),
      ).toBe(true);
      expect(() =>
        guard.canActivate(
          context(handler, user([MISC_PERMISSION_KEYS.BILLING_VIEW])),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('does not let billing view authorize a plan-change request', () => {
    expect(() =>
      guard.canActivate(
        context(
          'requestPlanChange',
          user([MISC_PERMISSION_KEYS.BILLING_VIEW], SecurityPrivilege.READ),
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows a billing manager to request a plan change', () => {
    expect(
      guard.canActivate(
        context(
          'requestPlanChange',
          user([MISC_PERMISSION_KEYS.BILLING_MANAGE], SecurityPrivilege.MANAGE),
        ),
      ),
    ).toBe(true);
  });
});
