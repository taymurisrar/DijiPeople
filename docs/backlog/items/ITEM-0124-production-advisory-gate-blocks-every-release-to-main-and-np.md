---
ID: ITEM-0124
aliases: [ITEM-0124]
Title: Production advisory gate blocks every release to main, and npm overrides are not honoured in the lockfile
Type: SECURITY
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [scripts/check-production-advisories.mjs]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
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
[[ITEM-0123]] — filed the same day as this record, for the same multer
override, with the deeper investigation this record's Resolution builds on and
defers to.

## Resolution

**Premise re-verified before investigating, as the record's own triage note
required.** `npm run check:production-advisories` passes today: 0 critical, 10
dispositioned (8 high, 2 moderate). The blocking half of this record — "every
release to production is blocked" — is confirmed historical, exactly as
triaged. Not chased further.

**The mechanism question — "why do overrides not apply" — was investigated
directly, empirically, on this branch, rather than reasoned about.** Findings:

1. **The existing override already works.** `node scripts/check-overrides-applied.mjs`
   reports `@mapbox/node-pre-gyp` `APPLIED — 2.0.3 satisfies ^2.0.3`. The
   record's headline claim — "overrides have never taken effect in this
   lockfile" — is false as stated. One override is declared and it is in
   effect, in the committed lockfile, right now. That script exists and is
   already wired into CI (`test-runtime` job, "Declared npm overrides are
   actually applied") specifically because of the failure mode this record was
   worried about (BUG-0163) — the capability this record asked for already
   exists.

2. **What genuinely does not work is adding a NEW override to an ALREADY-
   RESOLVED package and expecting an incremental `npm install --package-lock-only`
   to move it.** Reproduced directly: added `"multer": "^2.3.0"` to
   `overrides`, ran `npm install --package-lock-only` (with and without
   `--force`, and again after deleting just the `node_modules/multer` entry
   from `package-lock.json`) — every attempt reports `up to date` and leaves
   multer at `2.2.0`. This matches ITEM-0123's independent finding exactly,
   reproduced fresh rather than taken on its word.

3. **A genuinely fresh resolve DOES honour the override.** Copied only the
   `package.json` manifests into an isolated directory — no lockfile, no
   `node_modules`, the same shape CI's "Lockfile regenerates from the
   manifests" step uses — and ran `npm install --package-lock-only` there.
   `multer` resolved to `2.3.0`. `@nestjs/core` and `@nestjs/platform-express`
   both resolved to `11.2.3` — not downgraded, satisfying this record's
   Acceptance Criterion 4 on its own. This is npm's actual, reproducible
   behaviour: `overrides` are consulted when npm builds the dependency tree
   from scratch; an existing lockfile's already-resolved subtree is preserved
   rather than revisited unless something forces a full re-resolution of that
   subtree, and a declared-but-unwired override is exactly what
   `check-overrides-applied.mjs` exists to catch (confirmed: declaring the
   override without regenerating makes that check fail with `IGNORED`, exactly
   as designed).

**So the mechanism is not broken — it is a real, working, already-verified npm
behaviour with a real limitation** (new overrides need a full re-resolve to
take effect on an existing lockfile), not a defect in this workspace's
Turborepo/npm-workspaces setup specifically. Acceptance Criterion 3 — "an
overrides entry demonstrably changes the resolved version, proven by a test or
a documented check" — was already satisfied for the one override this repo
carries, by a script already wired into the required gate, before this record
was triaged.

**Whether to spend the fresh-resolve remedy on multer today was re-measured,
not re-assumed.** Ran the same isolated fresh resolve through
`npm audit --omit=dev --package-lock-only --json`: `multer`,
`@nestjs/core` and `@nestjs/platform-express` all clear, but the resolve
introduces **one CRITICAL** (`tar`) and **four new HIGHs**
(`active-win`, `cacache`, `make-fetch-happen`, `node-gyp`) that are absent from
the committed lockfile today. `check-production-advisories.mjs` accepts no
disposition for a critical, ever — so taking this remedy today would turn a
passing gate (0 critical, 10 dispositioned) into a failing one. This is the
same trade ITEM-0123 measured two days ago, re-measured today and still true:
trading three dispositioned highs for one undispositionable critical plus four
new highs is a regression, not a fix. **No override was added to `package.json`
as a result** — one was tried, confirmed to reproduce the exact failure this
record describes, and reverted; shipping an override the lockfile does not yet reflect
would itself fail `check-overrides-applied.mjs`.

The upstream removal trigger from ITEM-0123 was also re-checked:
`npm view @nestjs/platform-express@latest dependencies.multer` still reports
`2.2.0` on `12.0.1`, the latest published version. Not yet fired.

**Conclusion:** ITEM-0123's `DEFERRED` disposition is correct and stands
unchanged. This record closes as `DONE` because its own question — is the
override mechanism broken, and can it be made to work — has a complete,
evidence-backed answer: no, and yes-with-a-cost-that-is-not-worth-paying-today,
respectively. No code change was needed beyond what ITEM-0122/ITEM-0123 and
the existing `check-overrides-applied.mjs` had already put in place; this pass
corrected the record's mistaken "overrides never take effect" framing rather
than building a mechanism that already exists.

## History

- 2026-09-09 — created at `4ee7b2cd`, when it blocked the BUG-2732 release.
- 2026-09-11 — investigated directly: the existing override was confirmed
  applied, a new override was confirmed to require a full fresh resolve (not
  an incremental one), and that fresh resolve was confirmed to trade three
  dispositioned highs for one undispositionable critical plus four new highs —
  still true today, unchanged from ITEM-0123's measurement two days earlier.
  Closed DONE; ITEM-0123's DEFERRED disposition on the multer advisory itself
  stands.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
