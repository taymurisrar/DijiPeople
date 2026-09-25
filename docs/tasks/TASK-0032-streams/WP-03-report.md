# TASK-0032 WP-03 report — TOTP MFA, platform sign-in lockout, token TTL units

Branch `agent/pah-wp03-mfa`. Work in progress; sections are completed as each
commit lands.

## RECORD_CLOSURES

- **BUG-3548** — numeric `*_TTL_SECONDS` issued one-second tokens. Commit: the
  `fix(auth): …BUG-3548` commit on this branch. Spec:
  `services/api/src/common/config/auth.config.spec.ts`. Fails without the fix:
  yes (7 of 12, by mutation). Regression: REG-535.
