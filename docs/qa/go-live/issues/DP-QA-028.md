# DP-QA-028 — "Resend invitation" returns success but sends no e-mail (`deliveryMode: "disabled"`)

| Field | Value |
|---|---|
| Category | Functional |
| Severity / Priority | Medium / **P2** |
| Status | Open |
| Test | `DPQA-INV-103` (fails) |

`POST /employees/:id/resend-invite` → 201 with `invitation: { invitationId, deliveryMode: "disabled", expiresAt, activationLink }`; the local SMTP sink receives **nothing** (one e-mail in total, from the original create). The same environment delivers the initial invitation (`sendInvitationNow`), password-reset e-mails and the platform owner activation (`deliveryMode: "sent"`), so the sink and provider are fine.
The admin gets a raw activation link in the API response, but a user who lost their invitation never receives a new one unless the admin copies the link by hand, while the UI presumably reports "invitation resent". See also the token behaviour in [[DP-QA-027]].

| Run | Result |
|---|---|
| RUN-004 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - INV-103 pass: a new invitation e-mail reaches the local sink after resend |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - INV-103: pass |
