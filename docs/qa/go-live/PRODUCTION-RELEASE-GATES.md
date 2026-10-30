# Production release gates — Starter plan (checklist to run by the owner; QA did not and must not touch production)

Part of [[README]]. Every item is a **mandatory separate gate**: local QA cannot prove any of them.
Status column is filled in by whoever runs the check, with date and evidence link. Until each row is ✅, the go-live verdict cannot be READY.

## A. Entitlement enforcement (DP-QA-005 — OWNER DECISION: `ENFORCE` is mandatory; `REPORT_ONLY` blocks release)

Background: `entitlementEnforcement` defaults to `REPORT_ONLY` in code (`tenant-entitlement.service.ts`) **by design** — ADR-0009 moves
production to `ENFORCE` through a deliberate, per-environment act (`npm run entitlement:set-mode -- ENFORCE`), and says `seed:config` must not flip it.
A fresh or restored environment is therefore `REPORT_ONLY` until someone runs it.

| # | Check (read-only unless stated) | How | Pass criterion | Status |
|---|---|---|---|---|
| A1 | Current mode on production | `npm run entitlement:set-mode` with **no argument** against production env (reports, does not write) — or platform-admin settings screen | prints `ENFORCE` | ☐ |
| A2 | Grandfathering applied for existing tenants | confirm `grandfather-entitlement-overrides.ts` was run (ADR-0009) and `TenantFeature` CUSTOM overrides exist for tenants that use out-of-plan modules | no existing customer loses access unintentionally; list reviewed | ☐ |
| A3 | A Starter test tenant on production is refused a Growth module | owner of a **dedicated Starter test tenant** opens `/projects` and calls `GET /api/projects` | 403 / plan-gate screen | ☐ |
| A4 | Mode survives a release | after the next `release:api`, repeat A1 | still `ENFORCE` | ☐ |
| A5 | The four ungated features are understood | `desktop-agent`, `compliance`, `data-management`, `attendance-integrations` have no route guard (ADR-0009) — see DP-QA-010 | owner decision recorded, or guards added | ☐ |

## B. Environment parity (QA used `next dev` + a throwaway DB)

| # | Check | Pass criterion | Status |
|---|---|---|---|
| B1 | Production web is a `next build` output built from the release commit | `/api/health` commit hash equals the release SHA (memory: merging main does not guarantee deploy) | ☐ |
| B2 | `render.yaml` / Vercel env: `SECRET_ENCRYPTION_KEY`, `JWT_*`, `CORS_ALLOWED_ORIGINS`, `WEB_APP_PROD_ROOT_DOMAIN`, cookie `Secure` | all set; no QA values (`localhost`, `ENABLE_EMAILS=false`) | ☐ |
| B3 | Pre-deploy command applies migrations and `seed:config` | deploy log shows both | ☐ |
| B4 | Wildcard DNS / TLS for `<slug>.<root>` is live and `tenant-provisioning.wildcardDnsReady` is true **because it is true**, not forced (QA forced it locally) | a freshly provisioned tenant hostname resolves over HTTPS | ☐ |
| B5 | Activation / reset links use the production host. QA saw activation links generated against `*.dijipeople.com:<web port>` while testing locally. | link host/protocol/port correct on production | ☐ |
| B6 | Email delivery (activation, password reset, notifications) reaches a real mailbox | test tenant owner receives activation mail | ☐ |
| B7 | Stripe is in live mode and the Starter price schedule is sellable (memory: go-live blockers) | checkout of Starter completes in the intended mode | ☐ |

## C. Non-functional checks that must be re-measured on production-like infrastructure

| # | Check | Local observation (not evidence) | Pass criterion | Status |
|---|---|---|---|---|
| C1 | Logout latency (DP-QA-007) | 0.6–3.9 s, client timeout at 8 s | p95 < 1 s | ☐ |
| C2 | Page load of Employees / Leave / Attendance | see latest run PERF rows | within approved thresholds | ☐ |
| C3 | Concurrent read load | 25 parallel reads, see RUN | within approved thresholds on production-sized DB | ☐ |
| C4 | Login throttle is per client IP behind the proxy | in-memory fixed window keyed on IP+path | real client IP is used (not the proxy's) and throttling does not lock out an office behind NAT | ☐ |
| C5 | Backups / restore tested for the tenant database | n/a | restore drill recorded | ☐ |

## D. Release-stopping defects that must be resolved or formally accepted first

See [[KNOWN-ISSUES]] and [[REMEDIATION-BACKLOG]]. Gate rule: **no open P0/P1**.

## E. Additions from RUN-002
| # | Check | Pass criterion | Status |
|---|---|---|---|
| B8 | Production response headers on the tenant app: CSP (enforced vs report-only), `X-Content-Type-Options`, cookie flags | no `unsafe-eval` in production; cookies `Secure; HttpOnly; SameSite` | ☐ |
| E1 | Provision a **real** Starter tenant on production-like infrastructure and sign in as employee, manager, HR | no 403 on self-context/leave types (DP-QA-002/-011 fixed) | ☐ |
| E2 | Tenant onboarding checklist for leave types, shifts, work sites exists (OBS-008) | documented or automated | ☐ |
| E3 | Re-run the whole `e2e/golive` suite against a **production build** (`next build && next start`) for Firefox/WebKit/mobile | 0 failures other than documented accepted items | ☐ |

## F. Additions from RUN-003
| # | Check | Pass criterion | Status |
|---|---|---|---|
| F1 | Cross-browser smoke on the **deployed** HTTPS app: Safari/WebKit login works (Secure cookies), Firefox, Chrome | all 16 Starter routes render; DP-QA-023 fixed or accepted | ☐ |
| F2 | Rate-limit headroom for real usage: an Employee edit form (~20 lookups) plus dashboard polling stays well under 600 reads/min per user | no 429 in normal use; DP-QA-024 accepted or fixed | ☐ |
| F3 | Production runbook for provisioning covers the executed subscription agreement, wildcard DNS and owner activation before ACTIVE (OBS-009) | documented | ☐ |
| F4 | Retest evidence: RUN-004 shows DP-QA-002, -010, -011, -012 Resolved on the release candidate | 0 open P0/P1 | ☐ |
