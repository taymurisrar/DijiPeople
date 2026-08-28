# Bug pattern — `per-module-fix-behind-a-per-module-test`

**A shared mechanism fails, one module is repaired, and the regression test is
written in the shape of that module — so the class stays live everywhere else
and nothing can see it.**

The record closes `VERIFIED`. The test is real, it fails against the defect, and
it was mutation-checked. Everything that was asked for was delivered. But the
defect was never in the module — it was in the machinery the module shares with
a dozen others, and both the fix and the test were written at the wrong altitude
to notice.

The dangerous part is not the surviving bug. It is that the closed record now
reads as coverage. A future agent retrieving knowledge for the affected area
finds a `VERIFIED` record describing exactly this failure and concludes it is
handled.

## What it looks like

[[BUG-0220]] — "saving a plan from the runtime record page always returns 400".
The root cause was written down precisely and correctly:

> The runtime completes a form from the Prisma schema, which is a statement
> about the *database*; the API validates against a DTO, which is a statement
> about the *contract*. Nothing reconciled them.

`completeFormsFromSchema` marks every writable Prisma column editable, the
global `ValidationPipe` runs `forbidNonWhitelisted: true`, and any column the
DTO does not declare rejects the whole write. That is a property of the runtime,
not of plans.

The fix, and its own stated scope:

> Declare the plan form explicitly and mark every field `UpdatePlanDto` does not
> accept as read-only, so the save payload cannot contain one.

The regression coverage:

> `apps/admin/lib/runtime/plan-record-form.spec.ts` — "leaves writable only the
> fields UpdatePlanDto accepts" **parses `update-plan.dto.ts`** and fails on any
> writable plan form field the DTO does not declare.

The test reads one DTO file by name. It is a good test of plans and it is
structurally incapable of failing for any other module.

Eight days later, in a browser against production, editing a customer returned
`property originChannel should not exist` and editing a partner returned
`property partnershipModel should not exist` — the same mechanism, the same
pipe, two modules the fix never touched ([[BUG-1743]]). Both are records
platform operations edits daily.

There is a second tell worth naming. Because DTOs had since been mapped for
those modules, the failure moved *earlier*, from the write to `POST /validate`.
So the error surfaced sooner and still nobody noticed, because surfacing it in
the toolbar corner is not the same as anyone reading it.

## Why it survives review

- The record is honest. It states the general root cause and then a narrow
  resolution, and the two are only one sentence apart. Nobody reading it is
  being misled; the gap is simply not flagged as a gap.
- The test genuinely fails against the defect it was written for, so every
  quality gate that asks "does this test catch the bug" answers yes.
- The remaining instances are in modules nobody changed, so no diff touches
  them and no reviewer has cause to look.
- `VERIFIED` is a strong word. It stops further questions.

## Reviewer check

When a fix is for a **shared** mechanism — a runtime, a serializer, a guard, a
pipe, a base class — ask two questions before accepting it:

1. **Does the fix live where the mechanism lives?** If the root cause is in the
   runtime and the change is in one module's configuration, the class survives.
   That may be a deliberate, budgeted choice — but it must be *stated*, and the
   record must say which other modules are still exposed.
2. **Can the test fail for a module the author did not think about?** A test
   that names a file, a DTO, a route or a key is a test of that one thing.
   Prefer a test that enumerates the registry, the module map, or the DTO
   directory and asserts the invariant for every entry.

If the answer to either is no, require the record to name the remaining exposure
explicitly, rather than closing as though the class were handled.

## QA check

- Retest a `VERIFIED` shared-mechanism fix on **a module other than the one
  named in the record**. That single step is what turned BUG-0220 from closed
  into [[BUG-1743]].
- Treat "fixed for module X" as a claim about X only, never about the mechanism,
  no matter how the root cause is worded.
- Drive the browser. Both surviving instances pass every API test that omits the
  offending field; only the form sends it, and only a human hits the form.

## Related

- [[BUG-0220]] — the case this was written from; closed `VERIFIED` for plans.
- [[BUG-1743]] — the same mechanism, still live on customers and partners.
- [[BUG-1742]] — the neighbouring shape in the same serializer, where an
  untouched optional is sent as `""` rather than omitted.
- [`divergent-duplicate-guard`](divergent-duplicate-guard.md) — one rule copied
  into two places that drift. This is the inverse: one rule fixed in one place
  and left unfixed in the others.
- [`assertion-without-a-check`](assertion-without-a-check.md) — the other way a
  passing test proves less than it appears to.
- [`doc-code-drift`](doc-code-drift.md) — the same failure of trust, where the
  record rather than the test is what stops being true.
