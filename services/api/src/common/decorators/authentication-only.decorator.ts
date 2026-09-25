import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATION_ONLY_KEY = 'authenticationOnly';

/**
 * A self-scoped endpoint: a valid session is the whole requirement.
 *
 * ADR-0018, decision 3. An endpoint that acts solely on the caller's own
 * session or preferences — and takes no id that could point it at anyone else —
 * does not need a business permission. `POST /auth/activity` is the case that
 * made this explicit: it demanded the tenant permission
 * `user-preferences.write`, which no platform role holds, so the admin session
 * heartbeat was refused for almost every operator and the console turned each
 * refusal into a blocking error dialog (BUG-3545).
 *
 * `JwtAuthGuard` still runs; this is not `@Public()`. `PermissionsGuard` admits
 * the handler without reading permission metadata, and the dual-permission
 * invariant in wiring-invariants.spec.ts exempts it only because it is on the
 * reviewed list there — adding this decorator anywhere else fails that spec
 * until someone has looked at it.
 */
export const AuthenticationOnly = () =>
  SetMetadata(AUTHENTICATION_ONLY_KEY, true);
