---
ID: ITEM-0123
aliases: [ITEM-0123]
Title: multer carries three high advisories and the override that fixes it cannot be applied without a full re-resolve
Type: SECURITY
Status: PRODUCT_DECISION
Priority: P1
Severity: HIGH
AffectedModules: [dependencies, ci]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0123 — multer carries three high advisories, and the override that fixes it cannot be applied without a full re-resolve

## Summary

`multer` ≤ 2.2.0 carries three **high** denial-of-service advisories.
`@nestjs/platform-express` pins it at exactly `2.2.0`, so nothing in the tree can
move it. `multer@2.3.0` is outside the vulnerable range and a root `overrides`
entry does resolve to it — but only from a **from-scratch resolve**, and a
from-scratch resolve of this repository costs more than the advisory it fixes.

That last sentence is the finding. It is measured, not predicted.

## Why It Matters

**Reachable.** This is not a build-tool advisory. `multer` is the multipart
parser behind every authenticated file upload the API accepts — documents,
recruitment CVs, contract files, the agent's DLP screenshot ingest. The three
advisories are:

| | |
|---|---|
| GHSA-wc9g-mqfw-jrwm | DoS via crafted multipart field names |
| GHSA-qfvm-cv95-jqjf | DoS via file-descriptor leak on aborted uploads |
| GHSA-535w-7cp7-47q4 | DoS via oversized array index in field names |

**Blocking.** `check:production-advisories` is a required CI job, so `main` is
red and no release can merge while this stands.

## Evidence

npm's own offered fix is `@nestjs/core@7.5.5` — a downgrade from v11 — which is
not a fix and was never applied. `npm audit fix --force` was never run.

The override works. Proved in an isolated probe containing only the manifests,
exactly as CI's *Lockfile regenerates from the manifests* job does:

```
overrides: { "multer": "^2.3.0" }   ->   node_modules/multer -> 2.3.0
```

**It cannot be applied incrementally.** With the committed lockfile present, npm
reports `up to date` and leaves multer at 2.2.0 — after an override edit, after
removing `node_modules/.package-lock.json`, after `--package-lock-only`, and
after a complete `node_modules` removal and reinstall. The override is only
honoured when no lockfile exists.

**And a from-scratch resolve is worse than the disease.** Removing both
`node_modules` and `package-lock.json` and reinstalling produced multer 2.3.0 and
also:

| | |
|---|---|
| **a CRITICAL advisory** | `tar` — and the script allows no disposition for a critical, ever |
| four new highs | `active-win`, `cacache`, `make-fetch-happen`, `node-gyp` |
| churn | 294 packages version-changed, 206 removed, 249 added |

`active-win` is the desktop agent chain BUG-0052 already found hard to reason
about. The regeneration was reverted; the committed lockfile is unchanged.

The cause is that most ranges here are carets, so a from-scratch resolve is not
"the same tree plus multer" — it is *today's* tree, eight days of upstream
releases later, in one uncontrolled step.

## Proposed Approach

Three options; this needs a decision, not a default.

1. **Wait for upstream.** `@nestjs/platform-express` will bump its multer pin —
   this advisory is hours old and affects every Nest deployment. Costs nothing,
   fixes it properly, and the gate clears with no override at all. The exposure
   window is the wait.
2. **Disposition with an explicit expiry.** Honest, time-bounded, naming the
   three GHSAs and the upload endpoints, plus a follow-up to remove it. Unblocks
   releases immediately. It is a risk acceptance on a *reachable high*, which is
   the kind this script exists to make people argue for rather than assume.
3. **Take the from-scratch resolve as its own task.** Regenerate the lockfile
   deliberately, then work the resulting critical and highs down — an ExecPlan,
   with the agent chain and `tar` as its own problem. This is dependency
   maintenance that is due anyway; it is simply not something to do inside a
   release.

**Do not** apply option 3 as a side effect of unblocking a release. That is how
the CRITICAL got introduced in the first attempt.

## Acceptance Criteria

- `check:production-advisories` exits 0 with no critical.
- `multer` resolves outside `<=2.2.0`, or its presence is dispositioned with an
  argument naming the upload call sites and an expiry.
- No unrelated package moves version as a side effect of the fix.

## Dependencies

Option 1 depends on an upstream release. Options 2 and 3 do not.

## Related Items

[[ITEM-0122]] — the advisory sweep this was found completing; that one is done
and cleared 40 advisories.

## History

- 2026-09-09 — created at `aff47c47`, when three high advisories were published
  between a branch's CI run and its release PR's run, sixteen minutes apart.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[ci-architecture]]

<!-- GRAPH:END -->
