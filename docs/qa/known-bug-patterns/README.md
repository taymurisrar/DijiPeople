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
