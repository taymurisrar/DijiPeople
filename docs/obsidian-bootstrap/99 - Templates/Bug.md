# Bug — {{title}}

> Reported: {{date}}  ·  Severity: CRITICAL / HIGH / MEDIUM / LOW
> Status: New / Investigating / Root cause found / Fixed / Verified / Won't fix

## Summary

One or two sentences. What is broken, for whom.

## Severity

| Severity | Meaning in DijiPeople |
|---|---|
| **CRITICAL** | Cross-tenant data exposure or mutation; auth/authorization bypass; secret exposure; data loss; incorrect payroll payment amounts |
| **HIGH** | Object-level authorization gap within a tenant; missing audit on a sensitive operation; incorrect attendance or payroll calculation; a blocked core workflow |
| **MEDIUM** | Wrong behaviour with a workaround; missing state handling; performance problem on a common path |
| **LOW** | Cosmetic, copy, minor inconsistency |

Chosen severity and why:

## Environment

- Environment: local / UAT / production
- App: `apps/web` / `apps/admin` / `apps/landing` / `apps/agent-desktop` / API / gateway
- Tenant:
- Role of the affected user:
- Browser / OS / agent version:
- Date and time observed (with timezone):
- Trace id (`X-Trace-Id` response header) if available:

## Steps to Reproduce

1.
2.
3.

Reproducible: always / intermittently / once.

## Expected Behaviour

## Actual Behaviour

Include the exact error message, error code and trace id. Screenshots if the
issue is visual.

## Impact

Who is affected, how many, how badly, and whether there is a workaround.
For anything touching tenant isolation, authorization, audit or money, say so
explicitly here.

## Investigation

What was checked and what was found. Reference files by path.

- Relevant module:
- Relevant query / service method:
- `ErrorLog` entry (traceId, fingerprint, occurrenceCount):
- `AuditLog` entries around the event:

## Root Cause

The actual cause, not the symptom. If not yet known, say so.

## Fix

What was changed and where. Link the branch, PR or commit.

## Data Impact

Did this corrupt or expose data? Is a backfill or correction needed? Were other
tenants affected? **Answer this explicitly even when the answer is no.**

## Regression Test

What test now prevents this from recurring. If none was added, say why.

Reminder: `apps/web` and `apps/admin` jest suites cover **pure logic only** —
no jsdom, no rendering tests. Extract the logic and test that.

## Prevention

What would have caught this earlier — a test, a type, a review checklist item,
a documentation fix, a `docs/architecture/` correction.

## Related

Modules, features, ADRs, other bugs.
