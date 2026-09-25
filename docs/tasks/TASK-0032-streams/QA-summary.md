# TASK-0032 — QA summary (WP-09, live throwaway stack)

All results below were produced against a local throwaway stack — API on
`:4100`, admin `:3102`, web `:3101`, landing `:3100`, database
`dijipeople_pah_test` — by the Architect's browser scripts (repository
Playwright) and two QA agents working only through HTTP APIs and browsers.
Nothing here touched production. Related: [[TASK-0032]].

## Journeys executed

| Area | Journey | Result |
|---|---|---|
| Platform RBAC | Tenant profile edit through the API as SUPER_ADMIN, PLATFORM_OWNER alias, PLATFORM_ADMIN, PLATFORM_OPERATIONS | Before: 200, 200, 403, 403. After: 200 for all four |
| Platform RBAC | Tenant edit in the admin UI as PLATFORM_ADMIN and PLATFORM_OPERATIONS | "Tenant saved.", no permission dialog, no failed calls, no console errors |
| Platform RBAC | Authorization matrix, 8 callers × 11 endpoints (anonymous, tenant employee, tenant admin, PRESALES_USER, READ_ONLY_AUDITOR, PARTNER_MANAGER, PLATFORM_OPERATIONS, SUPER_ADMIN) | Every cell matched the ADR-0018 role matrix; anonymous 401, tenant users 403 on every platform route |
| Tenant isolation | Tenant A admin against a real second tenant's user/employee ids (`GET /employees/:id`, `GET /users/:id`, `POST /users/:id/mfa/reset`); `tenantId` injected into a tenant body | 404 for every foreign id; injected `tenantId` rejected 400 by whitelist validation |
| MFA (web) | Enrol from My Profile (QR, 32-char key, wrong code, correct code, 10 recovery codes, Done gated on acknowledgement); sign in with TOTP (no auth cookie before verify, wrong code refused); sign in with a recovery code; reuse of that code refused | Pass |
| MFA (admin) | Enrol on /security as PLATFORM_ADMIN; sign in with TOTP (no auth cookie before verify); users list shows MFA status and Reset MFA | Pass |
| MFA | Setup without `SECRET_ENCRYPTION_KEY` | Refused 503 with a clear message (the seed is never stored unencrypted) |
| Platform lockout | Six wrong admin passwords, then the correct one | Refused with the identical "Invalid admin credentials." (BUG-3146) |
| Admin screens | Dashboard, monitoring, error logs, users, partners, leads, contract templates, contracts, signature requests, security at 1440, 768 and 390 px | No horizontal scroll, no dialogs, no failed calls, no console errors (after the fixes below) |
| Partners | Company and individual applications, rejection, duplicate email / tax id / company name, existing partner at approval, missing downstream data, hand-off to the agreement gate | Pass (the public inquiry duplicate check keeps its documented merge-in-place 400) |
| Partners | Partial update (BUG-3566), type policy on the merged record | Pass |
| Lead attribution | API: inactive partner refused, same partner no-op, reassign, remove. UI: searchable picker with type and status, suspended partners not offered, confirmations | Pass |
| Agreements | Placeholder groups by type in the template editor; out-of-context token refused on save | Pass |
| Agreements | Source guards: suspended partner, archived lead, archived customer, lead attributed to another partner, duplicate agreement, required placeholder with no linked entity | Pass, each with a specific message |
| Agreements | Two-signer sequential signing (typed SCRIPT + drawn) on the landing site, decline with reason, cancel, reopen a used link | Lifecycle, evidence and messages pass |
| Agreements | Immutability after signing: source rename, edit endpoints | Signed content unchanged; edits refused |
| Agreements | Admin record actions for a signed and a draft agreement | Signed: no edit/send; draft: edit and workflow actions |

## Defects found and their disposition

| Defect | Severity | Disposition |
|---|---|---|
| Monitoring overview relative times caused a hydration error that the admin error dialog covered the page with | MEDIUM | Fixed `910fcb50` |
| "No email sent yet" turned the monitoring health headline to Unknown | LOW | Fixed `910fcb50` |
| Platform users list MFA column header clipped | LOW | Fixed `910fcb50` |
| MFA status read Off while new recovery codes were shown (web and admin) | LOW | Fixed |
| Error codes introduced by this task were uncatalogued, so clients saw `SYSTEM_UNEXPECTED_ERROR` | MEDIUM | Fixed `e52a345c`, `bbb61ab5` |
| Deleting a partner from a public inquiry or with attribution history, and bulk-deleting a lead with attribution history / agreements / reviews, crashed with a 500 | HIGH | Fixed `0a84a58e` (REG-620, REG-621) |
| Lead record never showed its attributed partner; attribution panel gave no current partner | MEDIUM | Fixed `0a84a58e` (REG-622) |
| "A individual partner requires" | LOW | Fixed `0a84a58e` |
| Agreement preview/draft generation never resolved placeholders | CRITICAL | WP-11 |
| Signature-date placeholders blocked sending; the workaround froze a fabricated date into the signed document | CRITICAL | WP-11 |
| Seeded partner agreement template has no signature block | MEDIUM | WP-11 |
| Counterparty placeholders grouped under "Customer" | LOW | WP-11 |
| `LeadsService.correctAttribution` gates by platform role literal rather than permission | LOW | Kept deliberately: attribution changes commission ownership, so it stays at the Platform Admin tier (WP-02 follow-up list) |
| Platform users page shows a full "Access denied … Open admin login" page to a signed-in operator without the permission | LOW | Pre-existing; deferred |

## Environmental observations (not product defects)

- The throwaway demo tenant has no plan or enabled modules, so the demo
  employee sees "Dashboard unavailable" and "Employee profile not linked".
- The primary checkout's `node_modules/@repo/config` is a stale copy; seeds
  there fail until `npm install` is run.
- The primary `.env` sets `*_TTL_SECONDS` to bare numbers, which issued
  one-second tokens before BUG-3548.
