# Known Bug Patterns

Defect classes this repository has actually produced. **Every pattern here was
observed in DijiPeople code**, with a named example — none are imported from a
generic checklist.

## How these are used

- **Architect** reads the patterns relevant to the modules in scope during
  planning and names them in the ExecPlan's risk section.
- **Reviewer** enforces each pattern's *Reviewer check*.
- **QA** derives scenarios from each pattern's *QA check*.

## How a pattern is added

Only when a defect is material and could plausibly recur. A typo is not a
pattern. New patterns come out of the bug learning loop in
[`../README.md`](../README.md).

## Index

| Pattern | Class | Observed in |
|---|---|---|
| [authorization-missing](authorization-missing.md) | Security | Organization / BusinessUnit controllers |
| [tenant-filter-missing](tenant-filter-missing.md) | Security | ErrorLogs support-role read |
| [permission-family-drift](permission-family-drift.md) | Security | Most guarded handlers |
| [service-authorization-hidden](service-authorization-hidden.md) | Maintainability | Employees profile routes |
| [fail-open-scope](fail-open-scope.md) | Security | `readTeam` in attendance and approvals |
| [sensitive-field-overexposure](sensitive-field-overexposure.md) | Security | Employee compensation |
| [search-filter-scope-overwrite](search-filter-scope-overwrite.md) | Security | Approvals list query |
| [self-approval](self-approval.md) | Domain integrity | Attendance corrections |
| [duplicate-route-bypass](duplicate-route-bypass.md) | Security | tenant-settings feature availability |
| [defined-but-unwired-permission](defined-but-unwired-permission.md) | Security | `organization.manage`, `tenant-settings.resolved.read` |
| [ui-permission-backend-mismatch](ui-permission-backend-mismatch.md) | UX / Security | Organization settings screens |
| [route-method-mismatch](route-method-mismatch.md) | UX / Availability | Admin session-expired sign-in link |
| [doc-code-drift](doc-code-drift.md) | Process | This framework's own AGENTS.md |
| [borrowed-fixture-dependency](borrowed-fixture-dependency.md) | Test integrity | Three attendance/gateway e2e suites, legal-seed, platform-workflows |
| [assertion-without-a-check](assertion-without-a-check.md) | Process / Test integrity | `forwarded-headers.ts` in all three frontends |
| [structural-guard-lost-in-rewrite](structural-guard-lost-in-rewrite.md) | UX / Test integrity | The subscribe wizard; the legal-seed operator assertion |
| [silent-config-fallback](silent-config-fallback.md) | Availability | The marketing site's Login button |
| [silent-degradation](silent-degradation.md) | UX / Data integrity | The subscribe wizard's country field |
| [divergent-duplicate-guard](divergent-duplicate-guard.md) | Security / Domain integrity | `ContractsService.update()`; workspace hostname resolution |
| [stale-read-model-of-a-write-rule](stale-read-model-of-a-write-rule.md) | Security / UX | Correction approve buttons; `/auth/me`; sign-out revocation |
| [unbounded-render](unbounded-render.md) | UX / Availability | The tenant timeline panel |
| [stale-generated-artifact](stale-generated-artifact.md) | Correctness | The platform runtime manifest |
| [premature-completion](premature-completion.md) | Process | This framework's own reporting |
| [unvalidated-seed-state](unvalidated-seed-state.md) | Deployment | `seed-config` required rows |
| [hidden-write-on-read](hidden-write-on-read.md) | Domain integrity | Read paths that mutate |
| [declared-but-unwired-step](declared-but-unwired-step.md) | Process | Pipeline steps declared and never run |
| [per-module-fix-behind-a-per-module-test](per-module-fix-behind-a-per-module-test.md) | Process / Correctness | BUG-0220’s plan-only runtime fix |

> Seven of these rows were missing from this index while their files existed —
> a pattern nobody can find is a pattern nobody applies. Added when
> `silent-degradation` was.
