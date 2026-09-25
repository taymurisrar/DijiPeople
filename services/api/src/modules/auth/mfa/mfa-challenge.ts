import type { AuthClientId } from '../../../common/config/auth.config';

/*
 * The MFA challenge token (ADR-0019).
 *
 * Issued by a sign-in whose password was correct but whose second factor is
 * still owed. It is a JWT signed with the client's **access** secret, and that
 * choice is deliberate: `JwtAuthGuard` refuses any token whose
 * `tokenUse`/`type` is not `access` before it looks at anything else, so a
 * challenge token is unusable as a session everywhere in the API without a
 * single line of new guard code — the property this design leans on, pinned in
 * `mfa-challenge.spec.ts`. A separate secret would have added a key to
 * provision and rotate and bought nothing the discriminator does not already.
 *
 * Five minutes, and never persisted: the verify endpoint re-reads the account
 * (still active, not locked, tenant still active) at the moment it is used, so
 * nothing captured in the token can outlive a change to the account. The
 * `sessionId` it carries becomes the id of the session the verify step issues,
 * which is what makes the token single-use — see `assertChallengeUnspent`.
 */

export const MFA_CHALLENGE_TOKEN_USE = 'mfa_challenge' as const;
export const MFA_CHALLENGE_TTL = '5m';
export const MFA_CHALLENGE_METHODS = ['TOTP', 'RECOVERY_CODE'] as const;

export type MfaChallengeKind = 'VERIFY' | 'SETUP_REQUIRED';

export type MfaChallengePayload = {
  sub: string;
  tenantId: string;
  sessionId: string;
  tokenVersion: number;
  type: typeof MFA_CHALLENGE_TOKEN_USE;
  tokenUse: typeof MFA_CHALLENGE_TOKEN_USE;
  appClientId: AuthClientId;
  aud: AuthClientId;
  authSubjectType: 'tenant-user' | 'platform-user';
  challengeKind: MfaChallengeKind;
  rememberMe: boolean;
};

/**
 * What a sign-in returns instead of tokens. No cookie accompanies it: both
 * controllers return this before `setAuthCookies`, and both Next.js login route
 * handlers pass it through without setting one.
 */
export type MfaChallengeResponse = {
  mfaRequired: true;
  challengeKind: MfaChallengeKind;
  challengeToken: string;
  challengeExpiresIn: typeof MFA_CHALLENGE_TTL;
  methods: typeof MFA_CHALLENGE_METHODS | readonly ['TOTP'];
};

export function isMfaChallengeResponse(
  value: unknown,
): value is MfaChallengeResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { mfaRequired?: unknown }).mfaRequired === true
  );
}
