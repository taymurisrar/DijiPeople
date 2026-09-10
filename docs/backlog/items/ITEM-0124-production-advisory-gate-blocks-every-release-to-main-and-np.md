---
ID: ITEM-0124
aliases: [ITEM-0124]
Title: Production advisory gate blocks every release to main, and npm overrides are not honoured in the lockfile
Type: SECURITY
Status: READY
Priority: P1
Severity: HIGH
AffectedModules: [scripts/check-production-advisories.mjs]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0124 — Production advisory gate blocks every release to main, and npm overrides are not honoured in the lockfile

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Re-measured on 2026-09-11 before triage: the gate now passes (0 critical, 10 dispositioned). The blocking half of this record is therefore historical. The substance is not. Overrides have never taken effect in this lockfile, so the only available remedy is a written risk acceptance, and eight high advisories now stand accepted rather than fixed. The record itself names the danger precisely: that pressure arrives exactly when a release is blocked, which is the worst moment to decide what risk is acceptable. Fix the override mechanism so a real remedy exists.

## Summary

`npm run check:production-advisories` fails again — three advisories this time:
`multer`, plus `@nestjs/core` and `@nestjs/platform-express` flagged only
through it. The step belongs to CI's *Runtime schema tests* job, so the
`CI required gate` fails, and `main` requires that gate. **Every release to
production is blocked while this stands**, on every branch, caused by no code
change at all.

This is the recurrence of [[ITEM-0122]], which closed `DONE` on 2026-09-08. The
advisory database moved again within hours. The recurrence itself is expected;
what is new, and what makes this worth its own record, is that **the escape
hatch does not work**.

`multer@2.3.0`, published 2026-08-28, sits outside the vulnerable range
(`<=2.2.0`) and has byte-identical dependencies to 2.2.0 — a pure patch release.
But `@nestjs/platform-express` pins `multer` at exactly `2.2.0`, and adding an
`overrides.multer` entry to the root `package.json` and running
`npm install --package-lock-only`, with and without `--force`, leaves the
lockfile resolving `multer` at 2.2.0 and records no `overrides` block at all.
The pre-existing `@mapbox/node-pre-gyp` override is not recorded either, which
suggests overrides have never taken effect in this lockfile.

## Why It Matters

It is the only thing standing between a validated change and production. On
2026-09-09 the fix for [[BUG-2732]] — the deadlock that stopped any on-premise
attendance integration from ever going live — passed 13 of 14 CI jobs and could
not be promoted to `main` because of this. The installers reached production by
another route, but the API and web halves of that release are still sitting on
`develop`.

npm's own remedy makes things worse rather than better: `fixAvailable` proposes
downgrading `@nestjs/core` to **7.5.5**, four majors back from the 11.x this
product runs. Taking it would break the application in order to silence the
gate.

The second cost is subtler and worse. With no working override, the only way to
clear a recurrence is to write a disposition — a security risk acceptance — and
the pressure to write one arrives exactly when a release is blocked. That is the
worst possible moment to be deciding what risk is acceptable, and the gate's own
message anticipates it: "An advisory with no argument behind it is an advisory
nobody decided about."

## Evidence

CI run `34315627919` on `agent/attendance-activation-and-release`: 13 jobs green,
`Runtime schema tests` red, `CI required gate` red. Identical failure, identical
three packages, on `develop`'s run `34287681104`.

```text
check-production-advisories: 3 production advisory(ies)
with no written disposition.
  high @nestjs/core
  high @nestjs/platform-express
  high multer
```

The root is `multer <= 2.2.0`, carrying four advisories: denial of service via
crafted multipart field names (GHSA-wc9g-mqfw-jrwm, CVSS 7.5), denial of service
via file-descriptor leak on aborted uploads (GHSA-qfvm-cv95-jqjf, 7.5), denial
of service via oversized array index in field names (GHSA-535w-7cp7-47q4, 7.5),
and a file-size-limit bypass race (GHSA-qvfw-j98x-7q72, 3.7). All are reachable
— the product accepts authenticated multipart uploads.

`@nestjs/platform-express@12.0.1`, the latest published, still pins
`multer: "2.2.0"`. There is no in-ecosystem version to upgrade to.

The override attempt, which did not take:

```text
package.json   overrides: { "@mapbox/node-pre-gyp": "^2.0.3", "multer": "2.3.0" }
package-lock   packages[""].overrides   -> null
package-lock   node_modules/multer      -> 2.2.0
```

## Proposed Approach

Two separate problems. Do not conflate them.

**The mechanism.** Find out why `overrides` is absent from this lockfile. Worth
checking in order: the npm workspaces interaction, whether the lockfile was
generated by a different npm major, and whether the root `package.json` is the
workspace root npm actually resolves overrides from. Until overrides work there
is no way to patch a transitive pin at all, which is a standing liability far
wider than this one CVE.

**This CVE.** Once overrides work, `multer@2.3.0` is a same-major patch with
identical dependencies — low risk, and the vendor's own fix for exactly these
advisories. If overrides cannot be made to work, the remaining options are
vendoring or waiting for NestJS. A disposition should be the last resort rather
than the first, and if one is written it should be written deliberately rather
than under release pressure.

## Acceptance Criteria

1. `npm run check:production-advisories` exits 0 on `develop` and on `main`.
2. `multer` resolves to a version outside the advisory range, or a disposition
   exists naming who accepted the risk and why.
3. An `overrides` entry in the root `package.json` demonstrably changes the
   resolved version in `package-lock.json`, proven by a test or a documented
   check. Otherwise the mechanism is still broken and the next recurrence lands
   in exactly the same place.
4. `@nestjs/core` stays on 11.x or later. No downgrade is accepted as a fix.

## Dependencies

None. It is self-contained, and it blocks every release while it stands.

## Related Items

[[ITEM-0122]] — the same gate, the previous recurrence, closed a day earlier.
[[BUG-2732]] — the release this recurrence blocked.

## History

- 2026-09-09 — created at `4ee7b2cd`, when it blocked the BUG-2732 release.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
