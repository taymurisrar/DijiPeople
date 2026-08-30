import { Global, Module } from '@nestjs/common';
import { EntitlementGuard } from '../guards/entitlement.guard';
import { TenantEntitlementService } from './tenant-entitlement.service';

/**
 * Global, like `PrismaModule` and `MailerModule`, for one reason: `@UseGuards`
 * resolves a guard's dependencies from the module that declares the controller.
 * `EntitlementGuard` is applied across ten domain modules, and making each of
 * them import an entitlement module would add ten import edges — some of them
 * cycles — to wire one stateless read. The alternative of leaving Nest to
 * instantiate the guard implicitly would work, but the house pattern is that a
 * guard used by a controller is a provider somewhere, so it is provided here.
 *
 * This module deliberately does not depend on `TenantSettingsModule`. The two
 * share `tenant-entitlement.rule.ts` — one rule, no duplicate source of truth —
 * without the request path having to pull in the settings module's controllers,
 * documents forwardRef and branding services.
 */
@Global()
@Module({
  providers: [TenantEntitlementService, EntitlementGuard],
  exports: [TenantEntitlementService, EntitlementGuard],
})
export class TenantEntitlementModule {}
