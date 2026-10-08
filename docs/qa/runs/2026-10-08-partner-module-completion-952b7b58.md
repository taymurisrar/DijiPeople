# QA Run — partner module completion

## Metadata

| | |
|---|---|
| Date / time | 2026-10-08 |
| Branch | `agent/partner-module-completion` |
| Commit SHA | `952b7b58` plus the resumed closure changes; final SHA recorded by integration |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-partner` |
| Environment | Local throwaway PostgreSQL `dijipeople_partner_e2e_test`; API on :4099 and Admin on :3012; local test-only secrets and email provider; no production data or external writes |
| QA agent | QA/UI-UX under Architect session [[SESSION-0119]] |
| Scope | [[TASK-0037]] / EXECPLAN-0055: partner numbering, write path, lifecycle, invitation, commissions, dependency-aware delete, related-record tabs and shared Admin runtime actions |

## Risk Areas

- Platform authorization and cross-partner portal-contact ownership.
- Status machines for partner, onboarding and commission records.
- Credential rotation and compensation after email delivery failure.
- Additive migration/backfill and sequence concurrency.
- Generic Admin runtime behavior shared by partners, leads, contracts and plans.
- Destructive-action prompts, inline domain refusals, empty states, keyboard/dialog behavior and mobile layout.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| QA-PARTNER-009..012 | duplicate prevention, audit/lifecycle, partial update and dependency-safe delete | API/negative | governed operations; no attribution loss | PASS | API specs and local DB-backed preflight |
| QA-PLATFORM-048..054 | partner delete, edit, lifecycle, invitation, commission, agreement-first creation and contact removal | platform/browser | complete operator journey | PASS | historical isolated-stack screenshots plus current automated suites |
| QA-PLATFORM-055 | reason-prompted commands open and execute | browser/UI | prompt visible; Suspend succeeds | PASS | fresh strict Playwright run; `73-resumed-reason-prompt.png` |
| QA-PLATFORM-056 | reported domain refusals stay inline | unit/UI contract | 4xx inline; 5xx still global | PASS | `reported-request.spec.ts` and adapter contract |
| QA-PARTNER-013 | activation delivery failure and final-commit compensation | security/negative | no lifecycle change; credential revoked; retry works | PASS | `partner-activation.workflow.spec.ts` / REG-659 |
| QA-PARTNER-014 | cross-partner activation email | authorization/negative | refuse before any credential/send/lifecycle write | PASS | `partner-activation.workflow.spec.ts` / REG-660 |
| QA-PARTNER-015 | failed onboarding resend compensation | concurrency/negative | stale failure cannot overwrite a newer token | PASS | conditional token predicate plus stateful invitation suite / REG-661 |
| Mobile partner record | responsive/accessibility | no page-level horizontal overflow; status remains textual | PASS | fresh strict Playwright run at 390×844; `74-resumed-phone.png`, 0 px overflow |

## Automated Suites

| Command | Result |
|---|---|
| `npm --workspace admin run test -- --runInBand` | PASS — 69 suites, 803 tests |
| focused Partner Experience invitation, activation and audit specs | PASS — 3 suites, 33 tests |
| `npm --workspace admin run check-types` | PASS |
| `npm --workspace api run check-types` | PASS |
| scoped API and Admin ESLint | PASS — 0 errors (one test warning removed) |
| `npm run test:runtime-schema` | PASS — 12 tests |
| `npm run test:partner-lifecycle` | PASS — 7 tests |
| `npm run test:platform-currencies` | PASS — 6 tests |
| `npm run prisma:validate` | PASS |
| `npm run check:runtime-schema` | PASS |
| `npm run test:db-preflight` | PASS — 9 tests |
| `npm run db:preflight` against the isolated database | PASS — schema, 234 migrations, generated client and database agree |
| `npm --workspace api run build` | PASS — clean Prisma generation and Nest production build |
| `npm --workspace admin run build` | PASS — Next production build, 116 pages |
| API full Jest with CI `DATABASE_URL` placeholder | PASS — 427 suites, 7,959 tests |
| final activation/onboarding focused rerun | PASS — 2 suites, 29 tests after reviewer compensation fix |

## Browser Validation

The original TASK-0037 walkthrough produced screenshots through activation,
referral creation, commission payment, suspension and dependency-aware delete.
Its runner caught step exceptions without setting a nonzero exit code, so that
evidence is treated as exploratory and is not the sole basis for PASS.

The resumed run changed the runner to fail the process on any step exception
and executed a focused acceptance against the current code. It loaded the real
partner record, verified the highlight header and governed tabs/subgrids,
reactivated the fixture where needed, opened the Suspend reason dialog, entered
a reason, completed the action, verified Suspended state, and repeated the
record at a 390×844 viewport. Exit code was 0; console/HTTP problem count was 0.

## Bugs Found and Triaged

| ID | Severity | Disposition | Verification |
|---|---|---|---|
| [[BUG-4005]] | HIGH | DONE | REG-657 + fresh browser prompt/action pass |
| [[BUG-4006]] | LOW | DONE | REG-658; 4xx/5xx/unknown-status contracts |
| [[BUG-4007]] | HIGH | DONE | REG-659; failed delivery, final-commit compensation and successful retry |
| [[BUG-4008]] | HIGH | DONE | REG-660; cross-partner identity ownership regression |
| [[BUG-4009]] | MEDIUM | DONE | REG-661; issued-token conditional compensation |
| [[BUG-4014]] | MEDIUM | DEFER | framework-only allocator/validator width mismatch; three-digit IDs used for this run |

No finding remains `TRIAGE_REQUIRED`.

## Known Limitations

- The current strict browser rerun targeted the recovered UI defects and mobile layout. The earlier full lifecycle screenshots remain supporting evidence; API/state-machine coverage carries activation, commission and deletion boundaries.
- Email delivery used the local test provider. Production provider health is verified by deployment smoke rather than this local run.
- The additive migration was validated on the local throwaway database. Production migration execution is part of the release sequence.

## Final QA Verdict

**PASS.** All selected and newly promoted scenarios pass, both affected
deployables build, the full API suite and Admin suite pass, and fresh strict
browser validation completed without an HTTP or console failure. No product or
security blocker remains in scope. Remote exact-SHA CI remains the Integrator
gate and is recorded in the session/task after the branch is pushed.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-4005]] · [[BUG-4006]] · [[BUG-4007]] · [[BUG-4008]] · [[BUG-4009]] · [[BUG-4014]] · [[QA-PARTNER-009]] · [[QA-PARTNER-013]] · [[QA-PARTNER-014]] · [[QA-PARTNER-015]] · [[QA-PLATFORM-048]] · [[QA-PLATFORM-055]] · [[QA-PLATFORM-056]] · [[SESSION-0119]] · [[TASK-0037]]

<!-- GRAPH:END -->
