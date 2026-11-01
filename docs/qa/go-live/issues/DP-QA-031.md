# DP-QA-031 — A password-reset link can be used more than once

| Field | Value |
|---|---|
| Category | Security (token lifecycle) |
| Severity / Priority | High / **P1** |
| Status | Open |
| Test | `DPQA-MAIL-002` (fails) |

With a disposable user: forgot-password → e-mail with a signed reset token (JWT, 24 h, `type` claim) → `POST /auth/reset-password` 201 → the new password works and the old one stops. **Presenting the same token again** with a different password is accepted (**201**) and changes the password again; it is refused only when the password was used before (password history → 400).
A reset link therefore stays valid for its whole 24 h life after use. Anyone who later reads the mailbox or a forwarded copy can take over the account within a day.
Controls that **do** work: per-user cool-down on reset e-mails (a second request within ~60 s sends nothing, identical response), no account enumeration (`DPQA-PWD-001`, `MAIL-001`), tampered tokens refused (`DPQA-MAIL-003`), password history. Fix direction: record the token id (`jti`) on first use, or reject tokens issued before the user's `passwordChangedAt`.

| Run | Result |
|---|---|
| RUN-004 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - MAIL-002, SEC-001 (5 concurrent resets -> exactly 1 works), SEC-002 (replay with same/attacker password refused), SEC-008 (old access token 401 after reset), SEC-010 (UI: second reset refused with "invalid or expired", `RUN005-DP-QA-031-reset-link-replay-refused-ui.png`) |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - MAIL-002: pass, SEC-001: pass, SEC-002: pass, SEC-008: pass |
