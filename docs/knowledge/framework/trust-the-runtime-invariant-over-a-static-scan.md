---
TITLE: Trust the runtime invariant over a static scan
TASK: TASK-0027
WP: —
CREATED_AT: 2026-08-29
VERIFIED_AGAINST_COMMIT: 8381ecad
---

# Trust the runtime invariant over a static scan — 2026-08-29

Written because it was already being cited. The engineering history for
2026-08-26 says "Reinforced
[[trust-the-runtime-invariant-over-a-static-scan]]" and then, two lines later,
"No new durable note" — so the vault carried a wikilink to a note nobody had
written, and `knowledge:verify` reported it as an unresolved link for three
days. The lesson was real; only the note was missing.

## The rule

When a static scan of the source and a spec that boots the real Nest application
disagree about this codebase, **the spec is right and the scan is wrong.**
Reconcile toward the runtime, and change the scan.

## Why, concretely

The disagreements are not close calls. They come from the same place every time:
a regex over source files cannot see what Nest assembles at runtime.

- **Decorators are inherited, composed and applied by factories.** A controller
  method whose guard arrives through a composed decorator, a base class, or a
  `@UseGuards` at the class level looks unguarded to a scan reading that one
  method.
- **Route paths are assembled from three places** — the global `/api` prefix,
  the `@Controller()` argument and the method decorator. A scan matching a
  literal path string matches none of them.
- **The module graph decides what exists.** A provider present in a file but
  absent from a module is not in the application; a scan counting files counts
  it anyway.

`wiring-invariants.spec.ts` and `platform-permissions.spec.ts` enumerate the
**real application's** route metadata through `Reflector`. What they report is
what will happen to a request.

## Where this has actually mattered

- **A scan of `@Permissions` / `@RequirePermission` pairs** disagreed with
  `wiring-invariants`. The scan was wrong; reconciling toward it would have
  "fixed" routes that were already correct and left the ones that were not.
- **`platform-permissions.spec.ts` enumerates the controller's own routes** and
  asserts each resolves to a permission. That is what makes a new `super-admin`
  route impossible to leave dead — BUG-0018's original defect, where
  `resolvePlatformPermission` had no `DELETE` mapping and the route answered 403
  for every role including the owner. A scan looking for "routes without a
  permission decorator" would have found nothing wrong, because the decorator
  was there; the *mapping behind it* was missing.
- **The dual-permission remediation** was measured at 796 violations by a report
  job and driven to zero by TASK-0005 WP-03. WP-09 then moved the invariant
  inside the required gate and deleted the report-only job — so the number is
  now enforced rather than observed.

## The corollary, which is the useful half

**A static scan is still worth writing — as a lead, never as a verdict.** It is
cheap, it runs without booting anything, and it points at where to look. What it
must not do is decide.

So: when the two disagree, do not reconcile the invariant to the scan. Find out
why they differ, fix the scan, and leave the invariant alone. If the scan cannot
be made correct, delete it rather than leave a second answer standing next to
the true one — [[BUG-0018]] is the shape of what happens when two mechanisms
describe one decision and drift apart.

## Related

Modules [[platform-auth]], [[super-admin]]. Bug [[BUG-0018]].
