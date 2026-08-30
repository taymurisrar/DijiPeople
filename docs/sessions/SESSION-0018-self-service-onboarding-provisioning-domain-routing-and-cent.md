---
SESSION_ID: SESSION-0018
aliases: [SESSION-0018]
TASK_ID: TASK-0008
TITLE: Self-service onboarding, provisioning, domain routing and central login
ARCHITECT_INTENT: Self-service onboarding, provisioning, domain routing and central login
STATUS: COMPLETE
TASK_TYPE: FEATURE
TASK_SIZE: LARGE
BASE_BRANCH: origin/develop
BASE_SHA: 494c44de866a885c083084d81303fa3707b48002
TASK_BRANCH: agent/self-service-onboarding-provisioning
TARGET_BRANCH: develop
WORKTREE: D:/My Work/hrm-dijipeople/DijiPeople-selfservice
AFFECTED_MODULES: [billing, super-admin, outbox, tenant-domains, prisma]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: [WP-09]
SCHEMA_WRITE: YES
CI_STATUS: PASS
MERGE_STATUS: INTEGRATED
STARTED_AT: 2026-08-18T23:23:49.309Z
LAST_HEARTBEAT: 2026-08-18T23:23:49.309Z
BLOCKERS: none
---

# SESSION-0018 — Self-service onboarding, provisioning, domain routing and central login

## Intent

Self-service onboarding, provisioning, domain routing and central login

## Scope

[[TASK-0008]]. The brief was reconciled against the repository before planning:
most of the self-service system already exists, so the scope is the genuine gaps
rather than the brief's chapter list.

Delivered: [[BUG-0075]] — an unthrottled public write plus the inert invariant
that should have caught it — and WP-01, the workspace-address reservation, one
column, proven against real PostgreSQL.

Found and deliberately **not** fixed: [[BUG-0077]] and [[BUG-0078]], which
together mean the website has never reached the provisioning engine. WP-10 and
[`EXECPLAN-0001`](../plans/EXECPLAN-0001-tenant-creation-behind-confirmed-payment.md)
carry that work. An implementation of BUG-0077 alone was written and reverted,
because removing the pre-payment tenant without wiring the provisioning consumer
would strand paying customers.

## Concurrency

`schema` lease held — taken for the WP-01 migration, retained for WP-10's
transaction-boundary work. `session.mjs check` returned `SAFE_PARALLEL` against
SESSION-0003, SESSION-0015 and SESSION-0017; none touches `modules/billing`.

`develop` moved from `aa33524` to `494c44d` during this session's discovery
phase, when a concurrent session landed framework hardening. The worktree was cut
from the new tip rather than from the SHA discovery started at.

Database work used `dijipeople_t8_test`, a throwaway carrying the full
211-migration history. The populated `dijipeople` development database was not
touched, and `dijipeople_wp_test` was left to its owning session.

## History

- 2026-08-18 — session started from `origin/develop` at `494c44d`.
- 2026-08-19 — `a40f038` BUG-0075 fixed and mutation-tested. `8b51613`
  reconciliation corrected against `CustomerAccount`. `4f966ea` WP-01. `0177db9`
  BUG-0077 and BUG-0078 recorded, EXECPLAN-0001 written, TASK-0007 WP-07
  reopened, WP-10 made the critical path.
- 2026-08-19 — `7480756` WP-10: payment authorises provisioning, the
  pre-payment tenant removed and the missing outbox consumer written, in one
  change because either alone leaves the platform worse. `46c24b1` WP-03 status
  API. `b68c7bf` WP-02 owner email verification. `1da7add` WP-04 onboarding API
  surface. `2b07be4` WP-11 the five-step wizard.
- 2026-08-19 — `7557d14`, `a60ba83`, `d4c0b00` OD-01: the operator named from
  the details the owner supplied, publication refused while a placeholder
  remains, and a placeholder PKR schedule seeded as drafts. `4081e79` the
  checkout path proven against the real Stripe test sandbox. `e9f977c`
  BUG-0080 — the prices were right and every word around them was wrong.
- 2026-08-20 — `ffda0e3` WP-05: the success page reports provisioning instead
  of guessing at it, with the poll backed off so it cannot rate-limit itself
  out of its own purpose. `71f1795` WP-07 and BUG-0081. `f5bd870` WP-08 and
  BUG-0082 — BUG-0066 returning in a worse shape. `d054769` the QA campaign and
  the two defects it found in the legal seed.
- 2026-08-20 — `c935fcb` merged `origin/develop`, 36 commits ahead. Nineteen
  conflicts, one real collision: both branches had independently claimed REG ids
  from 065. Mine renumbered to 071–077, following the precedent develop set when
  it hit the same thing. ITEM-0067 withdrawn as a duplicate — the campaign had
  run on a stale base and rediscovered work already finished under ITEM-0047.
- 2026-08-20 — `1238cfc` the post-merge baseline (e2e 326/326) and the
  engineering history. `d76c53f` knowledge capture: two bug patterns and the
  acquisition-path implementation note.

## Outcome

Nine of eleven work packages closed. WP-06 stays blocked on [[ITEM-0062]] — the
workspace switcher needs an identity/membership model, and `/workspaces/mine`
returns a one-element array by construction until that exists. WP-09 is this
finalization.

Three things are the owner's, not the framework's, and none is a defect:
publish the legal drafts, supply real PKR prices, and add QAR prices. Until the
first, a purchase records no consent, because the wizard requires only
agreements carrying a published version and there are none.

**What this session got wrong, recorded because it is reusable.** The QA
baseline was taken before merging the integration branch, so 81 already-fixed
failures were rediscovered, investigated and filed. The analysis was right and
entirely wasted. Merge first, then baseline.
- 2026-08-20 — `09f24ea` passed `CI required gate` (run 32318019957), all
  fourteen jobs green including Browser e2e and Database e2e. Integrated into
  `develop` by ref-push, so the develop tip is byte-identical to the SHA the
  verdict was read on: `09f24ea`. `schema` lease released.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Engineering history for `agent/self-service-onboarding-provisioning`:

[[2026-08-20-self-service-onboarding-provisioning-c935fcb]]

Records this session worked on, cited in its own body:

[[BUG-0066]] · [[BUG-0075]] · [[BUG-0077]] · [[BUG-0078]] · [[BUG-0080]] · [[BUG-0081]] · [[BUG-0082]] · [[ITEM-0047]] · [[ITEM-0062]] · [[ITEM-0067]] · [[SESSION-0003]] · [[SESSION-0015]] · [[SESSION-0017]] · [[TASK-0007]]

Modules this record declares as affected:

[[billing]] · [[database-architecture]] · [[outbox]] · [[super-admin]] · [[workspace-routing-and-domains]]

<!-- GRAPH:END -->
