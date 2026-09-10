---
ID: BUG-3110
aliases: [BUG-3110]
Title: A live production database password sits permanently in the public git history
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-09-10
DetectedInSha: 9b2fc338
AffectedModules: [services/api]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3110 — A live production database password sits permanently in the public git history

> **Architect triage, 2026-09-11 — `FIX_NOW`.** This is the highest-severity
> finding the platform currently carries and the first of the ten actions in the
> 2026-09-10 technical audit. It is filed as its own record because the audit
> observed, correctly, that no bug record tracked it — the leak was noted only as
> an operational warning in two deployment documents, and the admin-password half
> was never noted anywhere.

## Summary

`services/api/.env.production.example` carried the real production Neon
`DATABASE_URL`, password included, as a tracked file in a **public** GitHub
repository. The line was added on 2026-05-12 and removed on 2026-07-02, so it was
readable in the working tree for roughly seven weeks. Removing the line does not
remove the secret: history was never rewritten, so the password remains readable
today by anyone who clones the repository.

A second secret in the same file — `BOOTSTRAP_ADMIN_PASSWORD` — was never removed
at all and is still in the current tracked tree.

The endpoint is not a placeholder. It is the exact production host independently
documented in `docs/deployment/platform-access.md`, which distinguishes this from
the fabricated example hostnames used elsewhere in the repository's own tests.

## Expected Behavior

No real credential is ever committed. A credential that has been committed to a
public repository is treated as compromised from that moment: it is rotated, and
the platform is configured so the same class of mistake cannot be pushed again.

## Actual Behavior

- The production database password is permanently readable in the public history.
- The bootstrap admin password is in the current tree.
- Secret scanning, push protection and Dependabot security updates were all
  **disabled** on the repository, so nothing detected either one and nothing
  would have blocked the push.

## Reproduction

Anyone with a clone of the public repository:

```
git log --all -p -S'.neon.tech' -- services/api/.env.production.example
```

returns the full connection string, password included, from commit `74d3ea3d`
(2026-05-12, "tenant slug fixes"). Commit `e2b03b69` (2026-07-02) removes the
line and does not remove the secret.

```
grep -n BOOTSTRAP_ADMIN_PASSWORD services/api/.env.production.example
```

returns the admin password from the current tree.

## Evidence

- Repository visibility confirmed `PUBLIC` via the GitHub API on 2026-09-11.
- Host `ep-crimson-field-amm402fv.c-5.us-east-1.aws.neon.tech` matches
  `docs/deployment/platform-access.md` exactly.
- Repository security settings read on 2026-09-11, before remediation:
  secret scanning `disabled`, push protection `disabled`, Dependabot security
  updates `disabled`.
- Full finding, with the surrounding sweep that found no other real secret in any
  tracked file, is SUP-01 in
  `docs/engineering/audits/2026-09-10-full-technical-audit/raw/SUP.md`.

The leaked credential was **not** used to test whether it still authenticates.
Connecting to a production database with a leaked password is not a safe
diagnostic, and the answer does not change the remedy: a credential published to
a public repository is rotated regardless of whether it currently works.

## Root Cause

`.env.production.example` is meant to be a template of variable *names*. It was
filled in with real values at some point and committed, and nothing in the
repository or the platform checked that an example file contained only examples.

## Impact

Every tenant's HR and payroll data. A reader of the public repository holds, or
held, full read and write access to the production database: employees, salaries,
bank details, national ids, attendance, payroll runs. There is no evidence of
misuse and no way to obtain any, because the platform has no database audit
logging and no monitoring — which is finding OBS-01 of the same audit and is why
"we would have noticed" is not available as an argument here.

The secondary impact is the admin credential: `BOOTSTRAP_ADMIN_PASSWORD` in the
tree is the seed value for the platform super admin, the identity with
cross-tenant reach.

## Affected Areas

- `services/api/.env.production.example` — the file, and the git history that
  outlives edits to it
- The Neon production database, project `wispy-dream-20751252`, role
  `neondb_owner`
- The Render service environment, which holds the credential that must change
  with it
- GitHub repository security settings

## Proposed Resolution

Four parts. Two are done; two need the product owner's hand.

1. **Repository protections — DONE, 2026-09-11.** Secret scanning, push
   protection and Dependabot security updates enabled via the GitHub API. Push
   protection is the part that matters: it refuses the next push carrying a
   recognised credential. Two sub-settings, non-provider patterns and validity
   checks, remain `disabled`.
2. **Remove the admin password from the tree.** Replaced with an obvious
   placeholder, with a validation check that fails if an example env file ever
   again contains something shaped like a real credential. Carried by the
   Security stream of SESSION-0098.
3. **Rotate the Neon role password — NOT DONE. Requires the product owner.**
   The rotation, and the Render environment update that must accompany it, are
   production control-plane mutations that this session's harness refuses. It is
   the only remedy that actually removes the exposure; everything else on this
   list reduces recurrence.

   The runbook, verified against the live control plane on 2026-09-11:

   1. Neon project `wispy-dream-20751252`, branch `production`
      (`br-snowy-mud-am2378xn`), role `neondb_owner` — reset the password.
   2. Render service `srv-d7js7fqqqhas739v4i7g` — set `DATABASE_URL` to the new
      connection string.
      **Only that one variable.** `platform-access.md` records that
      `DIRECT_DATABASE_URL` is *not set* on the live service and that
      `DIRECT_URL` *is* set but is read by nothing in the codebase. Migrations
      fall back to `DATABASE_URL`, which is the direct endpoint. So there is one
      real variable to change, not two, and `DIRECT_URL` should be deleted rather
      than updated.
   3. Redeploy the service, then confirm `commitShort` at
      `https://dijipeople.onrender.com/api/health` and that the API is serving
      data rather than merely returning `ok` — the health check is static and
      cannot see a dead database, which is finding OBS-02 of the same audit.

   Between step 1 and the redeploy completing, new database connections fail
   while existing pooled connections survive, so the window is minutes rather
   than instant.
4. **History rewrite — DEFERRED, deliberately.** Rewriting published history on a
   public repository invalidates every existing clone and fork and does not
   recall what has already been read. Rotation is the remedy that works;
   rewriting history is cosmetic once the credential is dead. If the owner wants
   it done anyway, it is a separate planned change, not part of this fix.

## Acceptance Criteria

- No tracked file contains a credential that authenticates against anything real.
- The `neondb_owner` password in use by production is not the one in the public
  history, and the Render environment holds the new value in both `DATABASE_URL`
  and `DIRECT_DATABASE_URL`.
- A push containing a recognised credential is refused rather than accepted.
- A validation check fails the build if an example env file regains a value
  shaped like a real secret.

## Regression Coverage

The recurrence guard is a check over tracked `.env*.example` files that fails
when a value looks like a live credential rather than a placeholder, carried by
the Security stream of SESSION-0098. GitHub push protection is the second layer
and is platform-side rather than repository-side, so it is recorded here rather
than as a test.

Rotation itself is not a testable behaviour and gets no regression. What is
testable is that the credential never returns to the tree, and that is what the
check covers.

## Dependencies

Part 3 depends on the product owner, or on a session whose harness permits
production control-plane mutations. Nothing else in this record is blocked.

## Related Items

- [[ITEM-0131]] — the backup gap on the same database, found while checking this
  record's companion recommendation
- SUP-01 and CI-06 in the 2026-09-10 technical audit

## Resolution

Partial. Repository protections are enabled and the tree is being cleaned. The
credential itself is **not yet rotated**, so this record stays `OPEN`: the
exposure is live until it is. Marking it fixed on the strength of the two halves
that were achievable would be exactly the kind of flattering reading the
framework exists to prevent.

## QA Retest

Not applicable as a product behaviour. Verification is: read the repository
security settings back, grep the tree for credential-shaped values, and confirm
the production database rejects the leaked password once rotated.

## History

- 2026-09-10 — found by the supply-chain stream of the full technical audit
  (SUP-01), which noted that no bug record tracked it.
- 2026-09-11 — record created; repository visibility, security settings and the
  history entry independently re-verified; secret scanning, push protection and
  Dependabot security updates enabled; triaged `FIX_NOW`; rotation identified as
  blocked on the product owner.

## Notes

The audit's companion recommendation — raise Neon history retention to the plan
maximum and protect the production branch — rests on a false premise, and the
correction matters more than the original advice. The project is on the Neon
**free** plan. Six hours is not a retention setting somebody left low, it is the
plan maximum, and branch protection is not available on that plan at all. So
production HR and payroll data has no backup beyond a six-hour restore window
that nobody has ever tested. That is a spending decision rather than an
engineering one, and it is recorded separately rather than buried here.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0131]]
- Modules — [[api-architecture]]

<!-- GRAPH:END -->
