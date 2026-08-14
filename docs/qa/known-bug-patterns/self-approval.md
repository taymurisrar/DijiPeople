# Bug Pattern — Self-Approval

## Pattern
An approval or decision endpoint checks that the actor *may approve things*, but
not that the actor is not a party to **this** request. Segregation of duties is
never enforced.

## Why it happens in DijiPeople
Approval authority is expressed as a permission (`*.approve`, `*.manage`), and
permissions answer "may this role approve?" — a capability question. Whether the
actor is the submitter or the subject is a *relationship* question about the
specific record, which no decorator can express. The check has to be written in
the service, and it is easy to omit because the permission check looks complete.

## Example architecture area
`assertCanActionCorrection` never compared the actor to the request's parties,
and `canActionAttendanceCorrection` passes on a bare
`attendance.correction.approve` — which the seeded `manager` bundle grants. A
manager could file an attendance correction rewriting their own attendance and
overtime, then approve it in the same breath.

The precedent already existed elsewhere: `canOverrideLeaveDecision` in the leave
module checks the self condition **before** even the elevated-role bypass, with
the comment "Nobody may action their own request."

## Detection checklist
- Does the endpoint decide, approve, reject, cancel or override something?
- Does it compare the actor to the record's submitter **and** subject?
- Is the check before or after the permission/role paths? It must be before.
- Is there a proxy-submission path where one person files for another?
- Can an elevated role bypass it, and should it be able to?

## Required regression test
The submitter cannot approve or reject their own request. The subject cannot
either, even when someone else filed it. A legitimate approver still succeeds.

## Agent responsible
Backend/API.

## Reviewer check
For any decision endpoint, find the self-check and confirm it precedes every
permission path. Its absence is a finding even when permissions are correct.

## QA check
File as X, approve as X → denied. File as X for Y, approve as X → denied.
Approve as Y's manager → allowed.

## Prevention rule
Nobody actions their own request. Capability and relationship are different
questions; permissions only answer the first.
