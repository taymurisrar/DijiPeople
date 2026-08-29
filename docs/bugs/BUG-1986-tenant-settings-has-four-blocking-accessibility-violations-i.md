---
ID: BUG-1986
aliases: [BUG-1986]
Title: Tenant settings has four blocking accessibility violations including buttons with no name
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: 41eaadb4
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId:
RelatedBacklogItem: ITEM-0034
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1986 — Tenant settings has four blocking accessibility violations including buttons with no name

## Summary

An axe audit of `/settings/organization` in the tenant product returns **four
violations at critical or serious impact** — the threshold the browser suite
gates on. Two are critical.

The worst is `button-name`: **five buttons on that page have no discernible
text**. A screen reader announces each of them as "button", so the controls
exist and cannot be identified.

## Expected Behavior

No critical or serious violations. `apps/web/AGENTS.md` requires every control
to be labelled, meaning never to rest on colour alone, and dialogs to be
focus-trapped and escapable. Flow E established the gating policy for this
repository: critical and serious gate, moderate and minor are reported.

## Actual Behavior

```
CRITICAL aria-allowed-attr   Elements must only use supported ARIA attributes
                             [.cursor-pointer]
CRITICAL button-name         Buttons must have discernible text
                             [5 nodes, .rounded-[20px]:nth-child(1..5) > … > .h-7]
SERIOUS  color-contrast      Elements must meet minimum contrast thresholds
                             [4 nodes, incl. .bg-accent-soft.text-accent[aria-current="page"]]
SERIOUS  nested-interactive  Interactive controls must not be nested
                             [.cursor-pointer]
```

## Reproduction

1. Start the API and `apps/web` against a database seeded with `seed-demo`.
2. Sign in to a tenant workspace.
3. Open `/settings/organization`.
4. Run an axe audit at the standard tags — or run
   `npx playwright test --config e2e/playwright.config.ts flow-j`.

## Evidence

Found by Flow J on 2026-08-29 at `41eaadb4`, against a live local stack. The
full node lists are in the error above and in the run's trace.

Two of them point at the same element, `.cursor-pointer`, carrying both an
unsupported ARIA attribute and a nested interactive control — which usually
means one component is doing both wrong, so the two may share a fix.

`color-contrast` includes `.bg-accent-soft.text-accent[aria-current="page"]` —
the **current page** indicator in navigation. Meaning is being carried by a
colour pairing that does not meet the threshold, on the element whose whole job
is to tell you where you are.

## Root Cause

Not established. The selectors are Tailwind utility strings rather than
component names, so the next step is opening the trace and identifying the
components — `apps/web/app/(authenticated)/settings/_components` and the shared
`app/components/ui` kit are where to start.

## Impact

Five unlabelled buttons on a settings page make that page unusable with a screen
reader, not merely awkward — the user can find the controls and cannot learn
what any of them does.

Reachable in production, on the application every employee of every tenant uses.

Rated **HIGH** rather than MEDIUM, unlike its siblings BUG-1950 and BUG-1951:
those degrade orientation, this removes the ability to operate a control at all.

## Affected Areas

`apps/web` — tenant settings, and probably the shared component kit rather than
settings alone. The audit ran on one page; nothing suggests the components are
unique to it, and that is worth establishing as part of the fix.

## Proposed Resolution

Open the trace, identify the five unnamed buttons, and give them accessible
names — preferring a real label over `aria-label` where the control has visible
text. Then re-audit, because `nested-interactive` and `aria-allowed-attr` on the
same node may resolve together.

**Audit more than one page before closing.** This is one screen of 232 and there
is no reason to think it is the only one; the fix is likely in shared
components.

## Acceptance Criteria

- Zero critical and zero serious violations on `/settings/organization`.
- The same audit passes on at least two further tenant screens.
- Flow J's audit stops being `test.fixme` and gates.

## Regression Coverage

Flow J's `J — every settings control has an accessible name` is marked
`test.fixme` naming this record. It asserts the required state and is expected
to fail until the fix lands — rather than being weakened to pass, which would
turn the suite into a record of what the product does instead of what it must
do.

## Dependencies

None, though it shares a surface with
[[BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin]] and
[[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page]] and
the three are worth fixing in one pass over the shell and the settings kit.

## Related Items

Backlog item [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage]] — the third
defect its coverage found. Same class as
[[BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read]],
which is `VERIFIED` for the admin console and was never checkable for web.

## Resolution

Not fixed. Recorded rather than fixed inside the coverage task, per
[[EXECPLAN-0025-apps-web-browser-e2e-coverage]].

## QA Retest

Not retested — not yet fixed.

## History

- 2026-08-29 — found by Flow J's axe audit on its first run against a live
  stack. Four violations, two critical.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0034]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
