---
ID: ITEM-0068
aliases: [ITEM-0068]
Title: Legal publication has an operator UI, but no diff before publishing
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [legal, admin]
Source: IMPLEMENTATION
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-24
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation: TASK-0009
TargetMilestone:
BlockedBy:
---

# ITEM-0068 — Legal publication has an operator UI, but no diff before publishing

> **Rewritten 2026-08-24. Everything below the Summary describes the state on
> 2026-08-20 and is kept as written**, because the sections that follow are the
> argument for building the UI and that argument is what got it built. The
> premise has since changed: `4b1f1953` delivered the platform-admin surface,
> and five of the six acceptance criteria are met. See Acceptance Criteria for
> what is verified and what is not.
>
> **What remains is the diff**, and only that.

## Summary

*As of 2026-08-24:* the `legal` module now has `admin-legal.controller.ts`
alongside the public one, `apps/admin` has a Legal settings screen and a
document editor, and `LegalService.publish()` / `createDraft()` /
`updateDraft()` all have callers. Publishing is no longer a script-only act. The
one thing an operator still cannot do is **see what changed** against the
version they are replacing.

*As written on 2026-08-20:*

The `legal` module has exactly one controller — `public-legal.controller.ts` —
which serves published versions to anonymous visitors and 404s otherwise. There
is no platform-admin controller, no route, no screen.

So `LegalService` carries `publish()`, `createDraft()` and `updateDraft()`, and
**nothing calls any of them.** They were written, tested at the unit level, and
left unreachable. That is `declared-but-unwired-step`, and its consequence here
was silent rather than loud: with nothing published, the subscribe wizard
required no agreements, and every purchase recorded no consent at all.

`npm --workspace api run legal:publish` now exists and closes the immediate gap.
This item is the rest of it.

## Why a script was the right first move, and is not the right end state

The script is deliberate, auditable, idempotent, dry-run by default, and it
attributes publication to a real platform user. It unblocks the owner today and
it is repeatable across environments.

What it cannot do:

- **Show the operator what they are about to publish.** Publishing binds
  customers to a text. Doing that from a terminal, without seeing the rendered
  document or a diff against the version it replaces, is the wrong ceremony for
  the act.
- **Let anyone but a database-credential holder do it.** Legal text is owned by
  whoever is accountable for it, and that is not necessarily an engineer.
- **Support the ordinary lifecycle.** A correction means `createDraft()` →
  edit → review → publish. Only the last of those four has a door, so a
  correction today means editing `seed-legal.ts` and redeploying, which is an
  absurd path for a typo in a privacy policy.
- **Schedule an effective date.** `publish()` accepts `effectiveFrom` and the
  script never passes it, so every publication is immediate. Giving customers
  notice of a terms change is a normal obligation and currently impossible.

## Proposed Approach

A platform-admin surface in `apps/admin`, behind the existing platform guard:

1. `legal.controller.ts` under the platform path — list documents, read a
   version, create a draft, update a draft, publish with an optional
   `effectiveFrom`. Both permission decorators, as every guarded controller in
   this repository carries.
2. A screen that renders the markdown, shows a diff against the version in
   force, names the placeholders still unfilled, and requires an explicit
   confirmation naming the document.
3. Keep the script. It is the right tool for a fresh environment and for CI, and
   the two paths share `LegalService` so they cannot drift.

Needs an ExecPlan: it adds a controller, permission keys and an admin screen,
and the permission keys are the part worth getting right first.

## Acceptance Criteria

**Five of six are met as of 2026-08-24.** The operator UI was built in
`4b1f1953` ("feat(legal): author and publish legal documents from Platform
Admin") and this record was never updated, so it still reads as though
publishing is a script. It is not — but one criterion genuinely remains, so the
item is narrowed rather than closed.

| Criterion | State | Evidence |
|---|---|---|
| An operator with the right permission can publish without database access | **MET** | `admin-legal.controller.ts:93` guards with `JwtAuthGuard, RolesGuard, PlatformPermissionsGuard`; `POST versions/:versionId/publish` at `:159`. Screen at `apps/admin/app/(internal)/settings/legal/page.tsx`. |
| The screen shows the rendered text **and a diff** before any publication | **PARTIAL** | The full markdown is shown and editable (`legal-document-editor.tsx:274`), and a `dirty` check stops a publish over unsaved edits. **There is no diff against the previously published version** — no diff view exists in the editor, the page or the controller. |
| Unfilled placeholders are listed before the attempt, not thrown after it | **MET** | `legal.service.ts:240` collects them into `publishBlockers`; the editor renders them as a list at `:266` and disables Publish while any remain (`:294`). The throw at `:359` is the second line of defence, not the first. |
| `effectiveFrom` can be set to a future date | **MET** | `legal.service.ts:315` takes `effectiveFrom?: Date`; `:364` uses `effectiveFrom ?? now`. |
| The script keeps working and keeps sharing `LegalService` | **MET** | `prisma/publish-legal.ts:77` constructs `new LegalService(...)` — one implementation, two doors. |
| Publication is attributed to the acting platform user, never to a constant | **MET** | `admin-legal.controller.ts:161` passes `@CurrentUser() user` into the publish call. |

### What remains

Only the diff. An operator publishing version *n* cannot see what changed
against version *n−1* on the screen, which is the one thing that makes a
publication reviewable rather than merely permitted — and legal text is exactly
where a silent one-word change matters most.

Scope is now small and well understood, so `PLAN_REQUIRED` no longer fits: the
plan was written and executed, and what is left is a single addition to an
existing screen.

## Evidence

- `ls services/api/src/modules/legal/` — `public-legal.controller.ts` is the
  only controller.
- `grep -rn "legalService.publish\|legal.publish" services/api/src` — no caller
  before this task.
- `services/api/prisma/publish-legal.ts` — the script written to close the gap.
- `services/api/test/legal-publish.e2e-spec.ts` — the contract the UI must also
  satisfy.

## Related Items

- [[TASK-0009]] — where the script was written.
- [[TASK-0008]] — the parent whose checkout was capturing no consent because of
  this.
- [[declared-but-unwired-step]] — the pattern.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[legal]], [[platform-admin]]

<!-- GRAPH:END -->
