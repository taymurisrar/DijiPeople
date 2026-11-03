# RUN-008 measurements and observations (final attempt of each test)

Extracted by QA from the Playwright annotations of the merged final results (`e2e/golive-results/run008/merged`). Values were measured on the local isolated stack; response bodies are truncated and carry no credentials.

| Test | Project | Kind | Annotation |
|---|---|---|---|
| DPQA-APR-002 | chromium | observation | owner roles=global-admin; active leave route role=global-admin |
| DPQA-APR-010 | chromium | measurement | matrices after seed1=5, after seed2=5 |
| DPQA-CAT-001 | chromium | observation | non-QA plans beyond the three predefined: qa-repro-mvzrf9l8, qa-rsv-mvzq6ivc, qa-rsv-mvzqdc34, qa-rsv-mvzquz9x, qa-rsv-mvzr9gp7 |
| DPQA-CAT-003 | chromium | observation | 5 reference(s), 5 in allowed locations (migrations, tests, legacy/grandfather tooling) |
| DPQA-CPL-005 | chromium | observation | delete after unassign -> 200 {"success":true,"id":"f87023f8-28dd-497d-92bd-4ecd44cee5d7"} |
| DPQA-CPL-007 | chromium | observation | new plan created with no sales fields -> {"salesModel":"SALES_ASSISTED","isPublic":true,"publicationStatus":"DRAFT"} |
| DPQA-CPL-007 | chromium | observation | operator sellable list contains the new Custom plan: true (active + priced; staff-facing) |
| DPQA-CPL-009 | chromium | observation | PATCH tenants/:id/subscription of ANOTHER customer's tenant onto a reserved plan -> 400 {"success":false,"traceId":"req_92b5272f-5e3f-4362-8084-dec2b3f3ea1a","timestamp":"2026-11-02T22:19:50.859Z","statusCode":400,"errorCode":"V |
| DPQA-CPL-010 | chromium | observation | create-tenant onto a Custom plan without a published price -> 400 {"success":false,"traceId":"req_cc113b07-13b6-4584-be42-bdff628dd91d","timestamp":"2026-11-02T22:20:00.358Z","statusCode":400,"errorCode":"VALIDATION_FAILED","m |
| DPQA-CPL-010 | chromium | evidence | tenant rows with slug qa-orph-mvztmzal after the response: [{"id":"5d925183-7701-4e2a-9779-60e4a5625292","status":"PROVISIONING_FAILED","subs":"0"}] |
| DPQA-CUS-006 | chromium | observation | documents route status on a plan that omits the documents feature: 200 (ungated by design) |
| DPQA-CUS-010 | chromium | measurement | revocation enforced after access=5130 ms, refresh=5770 ms, sign-in=5751 ms (budget 60000 ms) |
| DPQA-CUS-012 | chromium | measurement | agent plan active after 636 ms; reassigned away after 61 ms; reassigned back after 582 ms (budget 60000 ms) |
| DPQA-CUS-020 | chromium | measurement | enterprise 644 ms; downgrade enforced 46 ms; upgrade restored 516 ms (budget 60000 ms) |
| DPQA-CUS-030 | chromium | observation | PATCH subscription with a past endDate and status EXPIRED -> 200 {"updatedSubscription":{"id":"26f0cf79-738c-48c5-9a31-58d215391b7e","plan":{"id":"a2cf9698-c67e-4f9c-b804-a1455a8e6595","key":"qa-cp-mvzv4zl |
| DPQA-CUS-030 | chromium | measurement | expired subscription cut the agent after -1 ms |
| DPQA-CUS-032 | chromium | observation | PATCH plan isActive=false while subscribed -> 200 {"id":"54011821-333d-4fcf-bf4e-a93f1021f65a","key":"qa-cp-mw0wxkqu-1","name":"QA Custom availability mw0wxkqu","descript |
| DPQA-EML-004 | chromium | observation | qa-probe providers after seeds: CONSOLE/default=true/enabled=true |
| DPQA-EML-005 | chromium | observation | non-production seed on a provider-less tenant: rows 0 -> 1: CONSOLE/default=true/enabled=true |
| DPQA-EXP-003 | chromium | observation | identifier columns offered for import: cnic, taxIdentifier |
| DPQA-EXP-004 | chromium | observation | sensitive-export surface advertised by /fields: no |
| DPQA-GATE-002 | chromium | evidence | unset: exit 1; REPORT_ONLY: exit 1; OFF: exit 1; empty: exit 1; lower-case enforce: exit 1; ENFORCED (typo): exit 1; ENFORCE with spaces trimmed: exit 0; ENFORCE: exit 0; exception "true": exit 0; exception "1": exit 1; exception "yes": exit 1; exception "TRUE": exit 1; exception does not bless a wrong mode silently: exit 0 |
| DPQA-GATE-006 | chromium | evidence | ok - plan entitlements are enforced, not merely logged | not ok - a Starter tenant is refused a module its plan does not include: Starter login: expected 2xx, got 401 |
| DPQA-GATE-008 | chromium | evidence | not ok - a Starter tenant is refused a module its plan does not include: Starter login: expected 2xx, got 401 |
| DPQA-IMX-031 | chromium | owner-decision | plaintext identity columns offered/exported: cnic, taxIdentifier |
| DPQA-MIG-002 | legacy-a | owner-decision | qa-custom keeps email-white-label without an explicit pre-migration grant - confirm the migration rule with the owner |
| DPQA-MIG-002 | legacy-a | owner-decision | qa-growth keeps desktop-agent without an explicit pre-migration grant - confirm the migration rule with the owner |
| DPQA-MIG-002 | legacy-a | owner-decision | qa-growth keeps email-white-label without an explicit pre-migration grant - confirm the migration rule with the owner |
| DPQA-MIG-002 | legacy-b | owner-decision | qa-custom keeps email-white-label without an explicit pre-migration grant - confirm the migration rule with the owner |
| DPQA-MIG-002 | legacy-c | owner-decision | qa-custom keeps email-white-label without an explicit pre-migration grant - confirm the migration rule with the owner |
| DPQA-MIG-005 | legacy-a | observation | qa-custom: converted plan in the staff-facing operator list (?sellable=true, active + priced): true |
| DPQA-MIG-005 | legacy-b | observation | qa-custom: converted plan in the staff-facing operator list (?sellable=true, active + priced): true |
| DPQA-MIG-005 | legacy-c | observation | qa-custom: converted plan in the staff-facing operator list (?sellable=true, active + priced): true |
| DPQA-MIG-008 | legacy-a | observation | qa-custom: converted plan isActive=true publicationStatus=ARCHIVED; subscription status=ACTIVE |
| DPQA-MIG-008 | legacy-a | observation | qa-growth: converted plan isActive=true publicationStatus=ARCHIVED; subscription status=ACTIVE |
| DPQA-MIG-008 | legacy-b | observation | qa-custom: converted plan isActive=true publicationStatus=ARCHIVED; subscription status=ACTIVE |
| DPQA-MIG-008 | legacy-c | observation | qa-custom: converted plan isActive=true publicationStatus=ARCHIVED; subscription status=ACTIVE |
| DPQA-PUB-001 | chromium | observation | create-tenant before publication -> 400 Plan "qa-cp-mvzr87xw-1" has no published monthly price. Configure and publish a price for this plan before creating a subscription. |
| DPQA-PUB-002 | chromium | observation | publishedById=2145a1dc-8b20-4477-958f-d48ad27ef888 |
| DPQA-PUB-003 | chromium | observation | create-tenant re-submit after publication -> 201 {"tenantId":"b518b8b9-dbe6-428e-a12c-a7d26b0ab9f7","customerId":"ae489de4-0813-42fc-a5e4-e6173ca4b24c","onboardingId":"1e801dc7-0ec4-4ca3-a998-7449653914dd","alreadyExists":true}; tenant right after: [{"id":"b518b8b9-dbe6-428e-a12c-a7d26b0ab9f7","status":"PROVISIONING_FAILED","subs":"0"}] |
| DPQA-PUB-003 | chromium | observation | control-plane retry-provisioning -> 201 {"tenantId":"b518b8b9-dbe6-428e-a12c-a7d26b0ab9f7","workspace":{"slug":"qa-pub-mvzr87xw","primaryHostname":"qa-pub-mvzr87xw.dijipeople.com","hostnameVerification":"VERIFIED","businessUnitCount":1,"userCount":1,"findings":[],"repairable":fal |
| DPQA-PUB-003 | chromium | evidence | create-tenant retry body {"tenantId":"b518b8b9-dbe6-428e-a12c-a7d26b0ab9f7","customerId":"ae489de4-0813-42fc-a5e4-e6173ca4b24c","onboardingId":"1e801dc7-0ec4-4ca3-a998-7449653914dd","alreadyExists":true}; tenant rows [{"status":"PENDING_SETUP","subs":"1"}] |
| DPQA-PUB-007 | chromium | observation | PATCH amount on a published price -> 500 |
| DPQA-PUBUI-001 | chromium | evidence | screenshots run008-evidence/PUBUI-001-*.png |
| DPQA-REV-001 | chromium | measurement | #1 withdraw: PATCH 248 ms, first check 403 after 147 ms | #1 grant: first check 200 | #2 withdraw: PATCH 209 ms, first check 403 after 159 ms | #2 grant: first check 200 | #3 withdraw: PATCH 220 ms, first check 403 after 80 ms | #3 grant: first check 200 | #4 withdraw: PATCH 192 ms, first check 403 after 139 ms | #4 grant: first check 200 |
| DPQA-REV-002 | chromium | measurement | 47 probes over 75654 ms, statuses 403 |
| DPQA-REV-003 | chromium | measurement | 133 requests, 93 started after the PATCH returned; statuses after: 403; before: 200,403 |
| DPQA-REV-004 | chromium | measurement | first check after the PATCH: issued token 403 (95 ms), refresh 403, new sign-in 403 |
| DPQA-REV-006 | chromium | measurement | plan edit -> refused after 114 ms |
| DPQA-REV-006 | chromium | observation | tenant-initiated Starter->Growth plan-change -> 201 {"requestId":"e054be7d-681b-4462-b3e0-af49cd6fa22b","direction":"UPGRADE","status":"APPLIED","effectiveAt":"2026-11-03T16:22:41.838Z","impact":{"gained":["advanced-data-management","attendance-integra |
| DPQA-RSV-002 | chromium | evidence | [{"k":"reserved","s":400,"m":"That plan is not available."},{"k":"sales-assisted custom","s":400,"m":"That plan is not available."},{"k":"missing","s":400,"m":"That plan is not available."}] |
| DPQA-RSV-002 | chromium | observation | plan-change PREVIEW of the reserved plan -> 400 {"success":false,"traceId":"req_76f55eb3-314e-4d42-96a8-6265d6217584","timestamp":"2026-11-03T16:34:03.864Z","statusCode":400,"errorCode":"VALIDATION_FAILED","m |
| DPQA-RSV-003 | chromium | observation | checkout-sessions on a reserved price -> 404 Plan price not found. |
| DPQA-RSV-003 | chromium | observation | public/subscribe on a reserved price -> 404 Plan price not found. |
| DPQA-SEC-020 | chromium | measurement | 8 concurrent activations took 696 ms; statuses 201,401,401,401,401,401,401,401 |
| DPQA-SESS-011 | chromium | not-run | idle (8 h) and absolute (12 h) session timeouts need real elapsed time or a clock override; BLOCKED(time) — revocation is covered by SESS-010, the token lifetime bounds by this test. |
| DPQA-SESS-022 | chromium | observation | stored/advertised idleTimeoutMinutes after setting 1 = 15; enforced minimum = 15 |
| DPQA-SESS-023 | chromium | observation | idle 16 min: guarded endpoint 401, /auth/me 401 |
| DPQA-SESS-050 | chromium | observation | GET /api/auth/me after 12 s with the dialog drawn -> 200; cookies kept: web_access_token,web_refresh_token |
| DPQA-SESS-050 | firefox | observation | GET /api/auth/me after 12 s with the dialog drawn -> 200; cookies kept: web_access_token,web_refresh_token |
| DPQA-SESS-050 | webkit | observation | GET /api/auth/me after 12 s with the dialog drawn -> 200; cookies kept: web_access_token,web_refresh_token |
| DPQA-WK-100 | webkit | observation | /: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-101 | webkit | observation | /settings: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-102 | webkit | observation | /settings/security-access: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-103 | webkit | observation | /employees: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-104 | webkit | observation | /leaves: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-105 | webkit | observation | /attendance: 0 failed _rsc prefetch(es), 0 page error(s) |