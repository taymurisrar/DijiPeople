---
TITLE: A security fix applied where the finding points is usually incomplete
TASK: SESSION-0097
WP: —
CREATED_AT: 2026-09-10
VERIFIED_AGAINST_COMMIT: 11afbd50
---

# A security fix applied where the finding points is usually incomplete — 2026-09-10

Produced by [[SESSION-0097]] shipping durable object storage on Cloudflare R2
(FILE-01/INF-05). An adversarial review by an agent that had not written the
implementation found four real defects in a branch whose own author had
already run a security checklist and mutation-tested its guards. Three of the
four were the same shape, independently, in unrelated modules:

| Finding | Fixed at | Still open at |
|---|---|---|
| `image/svg+xml` accepted, a stored-XSS vector against a Report-Only CSP | branding upload allowlist | the general document allowlist every other module uploads through |
| Export artifacts scoped to tenant only | `data-management` exports | `reporting` exports (`ReportRun.resultFileKey`) — a schedule email's run id read a colleague's file |
| `storageKey`/`storageProvider`/`checksumSha256` removed from client-facing shapes | the `documents` module's response mapping | `recruitment`'s `mapCandidate`, which spread the Prisma row straight into the response with no `select` |

The commit that closed all four states the lesson in one sentence: "a fix
applied where the finding pointed rather than everywhere the pattern lived."

## Why the narrow fix looked complete

Each narrow fix was good work on its own terms — correct, tested, and in one
case (the SVG removal) accompanied by a comment explaining exactly why SVG is
dangerous when served inline against a permissive CSP. The comment was true.
It was just attached to one of the two allowlists that needed it. A
reasonable-looking diff that resolves the reported symptom gives no signal
that a second, third or fourth instance of the same rule exists elsewhere —
the class only becomes visible by asking "where else does this concept
appear?" instead of "is the reported case fixed?"

This is not a new class of defect for this repository. Each instance maps
onto an existing [[divergent-duplicate-guard]] or
[[sensitive-field-overexposure]] occurrence:

- The SVG allowlist is [[divergent-duplicate-guard]] with a twist — not two
  copies of one rule drifting over time, but two allowlists that were always
  independent and were closed one at a time by two different tasks (branding
  upload validation, then the general document vault).
- The candidate-document leak is a textbook
  [[sensitive-field-overexposure]]: no explicit `select`, a full Prisma row
  spread into a response, authorization correct for the entity and absent for
  the columns.
- The export-scope gap is the same shape [[per-module-fix-behind-a-per-module-test]]
  describes for a shared mechanism, applied here to a shared **concept**
  (requester-scoped access to a generated artifact) implemented twice, once
  correctly.

**The durable point is not any one of the three.** It is that three
independent findings, discovered separately in one review pass, all
decomposed into patterns this repository had already named. The right
response to a finding in a class like these is to grep for the pattern — the
allowlist array, the missing `select`, the scoping predicate — across the
codebase before closing the record, not to re-derive from scratch whether
this specific instance is the only one.

## A passing security test proves nothing until it fails on purpose

The same branch mutation-tested its own protections rather than trusting that
a green suite meant the guard worked: the production/staging storage-provider
check was proven to fail when narrowed back to checking only `NODE_ENV ===
'production'`; the tenant-scoping checks on the storage layer were proven to
fail when the tenant-prefix separator or the path-traversal rejection was
removed. Each protection was deleted, the test was confirmed red, and the
protection was restored.

That discipline is what caught the fourth thing the adversarial review found
that a self-review had not: the candidate-document projection had **no test
covering it at all** until the leak was found, so there was nothing to
mutation-test yet. The new `candidate-document-projection.spec.ts` was written
and mutation-tested only after the defect was known — which is the ordinary,
correct order, but worth stating plainly: a suite that is green because the
relevant test does not exist yet reads identically, from the outside, to a
suite that is green because the protection works. [[checks-argued-not-tested-2026-08-25]]
and [[a-fix-wired-at-both-ends-only]] make the same point about non-security
guards; this session is the same lesson holding for authorization and
data-exposure checks specifically.

## The practical rule

When a fix touches a shared **rule** rather than a single call site — an
allowlist, a `select` projection, a scope predicate, a status gate — before
closing the finding:

1. Grep for the concept (the array literal, the field names, the query
   shape), not the file the finding named.
2. Enumerate every module that shares the concept and state, in the record,
   which ones were checked and which were found exposed.
3. Mutation-test the fix at each site: delete it, confirm the regression
   test goes red, restore it. A guard with no failing-red step behind it is
   unverified, no matter how confidently it reads.

## Related

- [[SESSION-0097]] — the session
- [[divergent-duplicate-guard]] — one rule, two places, drift
- [[sensitive-field-overexposure]] — authorization right for the entity, wrong
  for the columns returned
- [[per-module-fix-behind-a-per-module-test]] — a shared mechanism repaired in
  one module, regression-tested in the shape of that module only
- [[a-fix-wired-at-both-ends-only]] — mutation-testing a guard, from a
  non-security instance
- [[checks-argued-not-tested-2026-08-25]] — a comment explaining a check is
  not a substitute for a test that can fail
