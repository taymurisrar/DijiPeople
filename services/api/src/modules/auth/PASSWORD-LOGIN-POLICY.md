# Password & Login Policies

Settings live under the `security` category and are edited at
**Settings → Security & Access → Security Governance → Password & Login Policies**.

## What is enforced

| Setting | State | Enforced by |
| --- | --- | --- |
| `minimumPasswordLength` | Enforced | `PasswordPolicyService` |
| `requireUppercase` | Enforced | `PasswordPolicyService` |
| `requireLowercase` | Enforced | `PasswordPolicyService` |
| `requireNumber` | Enforced | `PasswordPolicyService` |
| `requireSpecialCharacter` | Enforced | `PasswordPolicyService` |
| `allowRememberMe` | Enforced | session handling |
| `sessionTimeoutMinutes` | Enforced | session handling |
| `refreshTokenExpiryDays` | Enforced | session handling |
| `absoluteSessionLifetimeDays` | Enforced | session handling |
| `idleTimeoutMinutes` | Enforced | session handling |
| `passwordExpiryDays` | Enforced | `PasswordPolicyService.isPasswordExpired` |
| `passwordHistoryCount` | Enforced | `PasswordPolicyService.assertPasswordNotReused` |
| `failedAttemptsBeforeLock` | Enforced | `LoginLockoutService` |
| `lockDurationMinutes` | Enforced | `LoginLockoutService` |

Every setting on that screen now changes behaviour.

## Where the rules are applied

`PasswordPolicyService.assertPasswordMeetsPolicy()` runs on every path that
sets a password:

- `AuthService.resetPassword()` - a reset link
- `UserInvitationsService.activateAccount()` - first sign-in from an invitation

**When adding another path that sets a password, call it there too.** The DTO
`@MinLength(8)` is a floor, not the policy: it cannot see the tenant.

### Two guarantees

1. **A tenant can be stricter than the platform, never looser.** The configured
   minimum is clamped to 8 at the bottom, so neither a misconfiguration nor a
   hostile value can drop the floor.
2. **A settings failure cannot weaken a password.** If the tenant's settings
   cannot be read, the strict platform default applies rather than an empty
   policy.

All violations are reported together, so a user fixes the password once instead
of discovering the rules one rejection at a time.

## Password reuse and expiry

`assertPasswordNotReused` compares the new password against the last N hashes
in `PasswordHistory`, where N is the tenant's `passwordHistoryCount` capped at
24 so a large value cannot turn one password change into hundreds of bcrypt
comparisons. `recordPasswordChange` stores the new hash and trims the tail; it
never throws, because losing a history row must not fail a change the user
asked for.

`isPasswordExpired` compares `User.passwordChangedAt` against
`passwordExpiryDays`. Two deliberate choices: 0 means never expire, and a user
with no recorded change date is treated as current rather than expired, so
switching expiry on cannot lock out an entire tenant at once.

## Lockout, as built

`LoginLockoutService` counts consecutive failures on the account and locks it
for `lockDurationMinutes` once `failedAttemptsBeforeLock` is reached. Three
properties are deliberate and covered by tests:

- **Counted per account, not per request.** Counting per address would be
  sidestepped by rotating addresses.
- **A locked account answers exactly like a wrong password.** Naming the lock
  would confirm the address exists and tell an attacker they are close.
- **It cannot be configured away.** A threshold of 0 clamps to 1 rather than
  disabling the lock, and a settings-read failure falls back to the default
  rather than to no protection.

The counter resets when the lock is applied, so an expired lock does not
re-lock on the very next failure.
