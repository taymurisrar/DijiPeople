# DP-QA-027 — Revoked and expired invitation tokens still activate the account

| Field | Value |
|---|---|
| Category | Security (token lifecycle) |
| Severity / Priority | High / **P1** |
| Status | Open |
| Tests | `DPQA-INV-102` (expired), `DPQA-INV-105` (revoked after resend) — both fail |
| Env | candidate `22a21a14`, production build; tenant `qa-prov-a`; local SMTP sink |

## Reproduction (CONFIRMED by test and by probe `invite-probe2.cjs`)
1. Create an employee with system access and "send invitation now" → one e-mail with a 64-hex activation token (`UserInvitation` row PENDING, `expiresAt` +48 h).
2. **Revoked:** `POST /employees/:id/resend-invite` → the old row becomes **REVOKED**, a new PENDING row is created. `POST /auth/activate-account` with the **old** token → **201 `{activated:true}`**; the old row flips REVOKED → **CONSUMED** and the newer pending row is revoked.
3. **Expired:** age the pending row (`expiresAt = now() - 1 h`; the fixture proves the row changed) and activate with its token → **201**.

## Impact
An invitation that an admin revoked (wrong recipient, leaver) or that has expired still lets whoever holds the link set a password and sign in. The 48-hour expiry promised in the e-mail ("expires in 48 hours") is not enforced. Tokens are random 256-bit values, so exploitation needs the link — but revocation and expiry are the only controls once a link leaks (mailbox forwarding, shared inbox, screenshot).

## Suspected cause
Activation looks the invitation up by token hash without filtering on `status = PENDING` and `expiresAt > now()`.

| Run | Result |
|---|---|
| RUN-004 | FAIL (INV-102, INV-105) |
