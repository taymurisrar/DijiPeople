import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ENTITLEMENTS_KEY } from '../decorators/require-entitlement.decorator';
import type { TenantFeatureKey } from '../constants/tenant-features';
import { AppError } from '../errors/app-error';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { TenantEntitlementService } from '../security/tenant-entitlement.service';

/**
 * The third gate: did this tenant buy this module.
 *
 * Shaped exactly like `PermissionsGuard` — declarative metadata, inert without
 * it — and deliberately not part of it. Permission asks whether a person may do
 * something; entitlement asks whether the tenant purchased the thing at all.
 * Two consequences follow from keeping them apart, and both are the point of
 * BUG-1952:
 *
 *   - `hasElevatedTenantRole` is not consulted here. A tenant administrator
 *     legitimately bypasses their own tenant's permission model; they cannot
 *     bypass their own tenant's contract. Adding that bypass to this guard would
 *     restore the exact defect this fix removes, so it is asserted by a test and
 *     not merely by this comment.
 *   - Platform users are exempt. A platform administrator acting across tenants
 *     through `super-admin` and `platform-*` is not a tenant using a plan, and
 *     the same subject distinction is already drawn in `JwtAuthGuard`.
 *
 * Placed after `PermissionsGuard` in `@UseGuards`, so a caller who could not use
 * the module anyway keeps receiving the authorization answer and no entitlement
 * lookup is paid for on a request that was already refused. It is still a guard,
 * so it runs before every pipe: a malformed body and a well-formed one both fail
 * on entitlement rather than on field names.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  private readonly logger = new Logger(EntitlementGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: TenantEntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<TenantFeatureKey[]>(
        REQUIRED_ENTITLEMENTS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    /*
     * No authenticated subject means either a @Public() route or a guard order
     * that has not run JwtAuthGuard yet. Neither is this guard's decision to
     * make, and refusing here would turn a missing-token case into a confusing
     * commercial error.
     */
    if (!user?.tenantId) {
      return true;
    }

    if (user.platform) {
      return true;
    }

    const mode = await this.entitlements.mode();
    if (mode === 'OFF') {
      return true;
    }

    const decision = await this.entitlements.decide(user.tenantId, required);
    if (decision.allowed) {
      return true;
    }

    /*
     * `path` rather than `originalUrl`: the query string can carry a tenant's
     * own filter values, and this line is written to a log the platform owner
     * reads in bulk.
     */
    const route = `${request.method} ${request.path}`;
    const summary =
      `tenant=${user.tenantId} features=${required.join(',')} ` +
      `route=${route} outcome=${decision.outcome}` +
      (decision.stale ? ' snapshot=stale' : '');

    if (mode === 'REPORT_ONLY') {
      /*
       * The deliverable of report-only mode. Switching straight to ENFORCE would
       * cut off every tenant already using a module it never bought, with no
       * warning to them and no list for the platform owner. These lines are that
       * list — a stable prefix so they can be counted per tenant and per module
       * before anybody decides to start refusing.
       */
      this.logger.warn(`ENTITLEMENT_WOULD_REFUSE ${summary}`);
      return true;
    }

    this.logger.warn(`ENTITLEMENT_REFUSED ${summary}`);

    if (decision.outcome === 'UNRESOLVABLE') {
      throw new AppError('TENANT_ENTITLEMENT_UNAVAILABLE', {
        details: { featureKeys: required },
      });
    }

    throw new AppError('TENANT_FEATURE_NOT_ENTITLED', {
      details: { featureKeys: required },
    });
  }
}
