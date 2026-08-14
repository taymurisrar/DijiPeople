# Bug Pattern — Hidden Service-Layer Authorization

## Pattern
A handler declares no permission, but the service *does* authorize — correctly.
The endpoint is safe, yet indistinguishable from one that is not, and nothing
protects the check from being deleted.

This is not a vulnerability. It is a **maintainability and review defect** that
makes real vulnerabilities harder to find.

## Why it happens in DijiPeople
Some authorization is genuinely context-dependent and cannot be expressed
statically. `assertEmployeeChildPermission` allows the action when the caller is
`ADMIN_MANAGE`, **or** is HR holding an admin key, **or** is the record's own
subject. A decorator cannot say "either `employees.education.create` or being the
owner of this record", so the check moves into the service — and the endpoint
looks bare.

## Example architecture area
Roughly 47 handlers, concentrated in `employees`, authorize in the service via
the `X` / `X.self` pattern. They sit in the same "declares nothing" bucket as
genuinely unguarded routes, so every audit has to re-derive by reading service
internals which are which. That re-derivation is what makes authorization
triage expensive.

## Detection checklist
- Handler declares nothing → does the service throw for an unauthorized caller?
- **Read the helper body.** A name is not evidence.
- Does the check run on every code path, including early returns and branches?
- Can the self-condition be forged by passing a different record id? (In the
  employees case it cannot: the access mode is resolved from the token.)
- Is the deferral recorded anywhere a reviewer would see it?

## Required regression test
Cover the deferred check directly: unauthorized caller denied, owner allowed,
and a different record id cannot yield the "self" outcome.

## Agent responsible
Backend/API.

## Reviewer check
Do not report a service-authorized handler as a vulnerability without reading
the service. Equally, do not accept "the service handles it" without reading it.

## QA check
Exercise the owner path and the non-owner path, and attempt to reach another
record via the self path.

## Prevention rule
Service-layer authorization is legitimate when the rule is context-dependent —
but it must be deliberate, tested and visible. An undocumented deferral is one
refactor away from being deleted silently.
