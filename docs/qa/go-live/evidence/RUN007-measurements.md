# RUN-007 measurements and observations (final attempt of each test)

Extracted by QA from the Playwright annotations of the merged final results (`e2e/golive-results/run007/merged`). Values are measured on the local isolated stack; response bodies are truncated and carry no credentials.

| Test | Project | Kind | Annotation |
|---|---|---|---|
| DPQA-APR-002 | chromium | observation | owner roles=global-admin; active leave route role=global-admin |
| DPQA-APR-010 | chromium | measurement | matrices after seed1=5, after seed2=5 |
| DPQA-CAT-001 | chromium | observation | non-QA plans beyond the three predefined: none |
| DPQA-CAT-003 | chromium | observation | 5 reference(s), 5 in allowed locations (migrations, tests, legacy/grandfather tooling) |
| DPQA-CPL-005 | chromium | observation | delete after unassign -> 200 {"success":true,"id":"74b737b2-3a52-41f9-a9c8-96e845146ad6"} |
| DPQA-CPL-007 | chromium | observation | new plan created with no sales fields -> {"salesModel":"SALES_ASSISTED","isPublic":true,"publicationStatus":"DRAFT"} |
| DPQA-CPL-007 | chromium | observation | operator sellable list contains the new Custom plan: true (active + priced; staff-facing) |
| DPQA-CPL-009 | chromium | observation | PATCH tenants/:id/subscription of ANOTHER customer's tenant onto a reserved plan -> 200 {"updatedSubscription":{"id":"d17dc796-9fb7-4177-89ef-1078ea7304af","plan":{"id":"8511c454-a573-4ab3-9d2a-03a1bde90e70","key":"qa-cp-mvzd6q3 |
| DPQA-CPL-010 | chromium | observation | create-tenant onto a Custom plan without a published price -> 400 {"success":false,"traceId":"req_5605d063-6a52-4526-8656-5c9c0e67eee7","timestamp":"2026-11-02T14:39:06.388Z","statusCode":400,"errorCode":"VALIDATION_FAILED","m |
| DPQA-CPL-010 | chromium | evidence | tenant rows with slug qa-orph-mvzd71iz after the response: [{"id":"9c509b1a-030d-40d8-a651-cadb62484e0e","status":"PROVISIONING_FAILED","subs":"0"}] |
| DPQA-CUS-006 | chromium | observation | documents route status on a plan that omits the documents feature: 200 (ungated by design) |
| DPQA-CUS-010 | chromium | measurement | revocation enforced after access=5171 ms, refresh=5632 ms, sign-in=5613 ms (budget 60000 ms) |
| DPQA-CUS-012 | chromium | measurement | agent plan active after 585 ms; reassigned away after 60041 ms; reassigned back after 66724 ms (budget 60000 ms) |
| DPQA-CUS-020 | chromium | measurement | enterprise 880 ms; downgrade enforced 59248 ms; upgrade restored 65082 ms (budget 60000 ms) |
| DPQA-CUS-030 | chromium | observation | PATCH subscription with a past endDate and status EXPIRED -> 200 {"updatedSubscription":{"id":"c2001cb1-1784-471b-bc7b-c28c0e3644ee","plan":{"id":"52153db8-54c6-4073-a070-16181522bbf9","key":"qa-cp-mvzco0q |
| DPQA-CUS-030 | chromium | measurement | expired subscription cut the agent after -1 ms |
| DPQA-CUS-032 | chromium | observation | PATCH plan isActive=false while subscribed -> 200 {"id":"a49411ce-f14c-4b54-992e-449e57dfb413","key":"qa-cp-mvzes078-1","name":"QA Custom availability mvzes078","descript |
| DPQA-EML-004 | chromium | observation | qa-probe providers after seeds: CONSOLE/default=true/enabled=true |
| DPQA-EML-005 | chromium | observation | non-production seed on a provider-less tenant: rows 0 -> 1: CONSOLE/default=true/enabled=true |
| DPQA-EXP-003 | chromium | observation | identifier columns offered for import: cnic, taxIdentifier |
| DPQA-EXP-004 | chromium | observation | sensitive-export surface advertised by /fields: no |
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
| DPQA-MIG-008 | legacy-c | observation | qa-custom: converted plan isActive=true publicationStatus=PUBLISHED; subscription status=ACTIVE |
| DPQA-SESS-022 | chromium | observation | stored/advertised idleTimeoutMinutes after setting 1 = 15; enforced minimum = 15 |
| DPQA-SESS-023 | chromium | observation | idle 16 min: guarded endpoint 401, /auth/me 401 |
| DPQA-WK-100 | webkit | observation | /: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-101 | webkit | observation | /settings: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-102 | webkit | observation | /settings/security-access: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-103 | webkit | observation | /employees: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-104 | webkit | observation | /leaves: 0 failed _rsc prefetch(es), 0 page error(s) |
| DPQA-WK-105 | webkit | observation | /attendance: 0 failed _rsc prefetch(es), 0 page error(s) |