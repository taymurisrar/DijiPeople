---
ID: ITEM-0109
aliases: [ITEM-0109]
Title: The disabled Check In button explains itself only in a title tooltip
Type: UX
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-29
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
RelatedBug: BUG-2008
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0109 — The disabled Check In button explains itself only in a title tooltip

## Summary

On a non-working day the Check In button on `/attendance` is correctly disabled
and carries a genuinely good reason — but the reason lives only in the `title`
attribute. A `title` tooltip is unavailable to touch users, is not reliably
announced by screen readers, and requires a hover the user has no reason to
attempt. So the product knows exactly why the control is unavailable and does not
tell most of the people who need to know.

## Why It Matters

The reasoning is already written and already correct; only its placement is
wrong. That makes this one of the cheapest usability improvements available — the
work is moving a string, not producing one.

It also matters more than a single button, because it is a pattern. A disabled
control with no visible explanation is indistinguishable from a broken one, and a
user who cannot see why Check In is unavailable will conclude attendance is
broken and raise a support ticket. Whatever is decided here should become the
convention for disabled controls in the tenant app.

`AGENTS.md` requires that controls be labelled, that meaning never be encoded in
a channel some users cannot perceive, and that the shared UI kit be used rather
than hand-rolled affordances. A `title`-only explanation fails the second of
those.

## Evidence

Observed 2026-08-29 on `https://dijipeople-demo.ws.dijipeople.com`, tenant
`DijiPeople Demo`, on a Saturday (a scheduled off day for that tenant):

```html
<button disabled title="Check in is unavailable because 2026-08-29 is a scheduled off day.">
  Check In
</button>
```

Nothing on the page states the reason in visible text.

The same schedule knowledge is what the dashboard's absent calculation fails to
consult (BUG-2008), so this tooltip is also the evidence that the product does
know the day is non-working.

No file:line evidence was collected; the attendance page's check-in control was
not located during the run.

## Proposed Approach

Render the reason as visible text adjacent to the control — a short line beneath
or beside the button — and keep the button disabled. Where the shared UI kit has
a suitable component for a disabled-with-reason state, use it; if it does not,
adding one is the better change, because the same pattern recurs across the
runtime surfaces.

Keep the `title` as well if it is wanted; the objection is that it is the *only*
channel, not that it exists.

## Acceptance Criteria

- On a non-working day, `/attendance` states in visible text why Check In is
  unavailable.
- The explanation is reachable without hovering and is announced with the
  control by a screen reader.
- The pattern chosen is available to other disabled controls rather than being
  local to this button.

## Dependencies

None.

## Related Items

BUG-2008 (every employee counted absent on a non-working day) concerns the same
schedule, read correctly here and not there. BUG-1956 (runtime lookup comboboxes
expose no listbox semantics) is the other accessibility record from this run.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW per the SESSION-0070 Architect triage: a cheap accessibility and usability win.
- 2026-09-11 — resolved. See Resolution below.

## Resolution

The record's own evidence noted "the attendance page's check-in control was
not located during the run." Located this session: it is not a bespoke button
on the attendance page at all, but the shared command bar every runtime list
page uses — `apps/web/app/components/runtime/module-command-bar.tsx`,
`CommandButton` — rendering the `attendance.checkIn` command declared in
`apps/web/lib/runtime/modules/standard-module-specs.ts`. That command's
`dynamicDisabled.reasonFieldLogicalName` already points at
`attendanceBlockedReason`, which `attendance/page.tsx` populates from the
API's `blockedReason` — the exact string quoted in the record. The premise
held: that reason reached only the `title` attribute.

**Fix**, in `CommandButton` (and its `title` logic left untouched, per the
record's own "keep `title` as well if it is wanted"): when a command's
disabled state carries a reported reason (`dynamicDisabledReason` — a schedule,
a policy, a state the command itself knows about, as opposed to a generic
`loading`/`disabled` prop with nothing to disclose), the button is now wrapped
with a visible `<p>` beneath it holding that exact text, tied to the button by
`aria-describedby` so a screen reader announces it with the control rather
than only on request. Nothing renders when there is nothing to disclose, so
every other command bar in the app is visually unchanged.

**This is the shared component**, not a local fix: every command using
`dynamicDisabled` — check-in/check-out, and any future one — gets the same
visible-reason behaviour automatically, satisfying the acceptance criterion
that "the pattern chosen is available to other disabled controls rather than
being local to this button" without a second implementation.

**Tests:** `apps/web` has no jsdom or React Testing Library (`jest.config.js`
says so explicitly), but `CommandButton` needs neither to prove the rendered
behaviour: it reads no context and its `runtime`/`onCommand` props are never
invoked by a static render, so `react-dom/server`'s `renderToStaticMarkup`
renders it for real. `apps/web/lib/runtime/attendance-checkin-disabled-reason.spec.ts`
now asserts, against the actual `attendance.checkIn` command definition: the
`resolveDynamicDisabledReason` logic surfaces the record's exact quoted
message over the generic fallback and reports nothing while enabled; and, on
the rendered markup, that the exact reported reason appears as **visible page
text** (not only inside an attribute), that it is tied to the button via
`aria-describedby`, that `title` still carries the same text, and that neither
the visible text nor `aria-describedby` appears when the command is enabled.
`npm --workspace web run test -- attendance-checkin-disabled-reason` — 8
passed. This technique and the fact that it generalises are recorded in
[[ITEM-0130]]'s companion `docs/knowledge/framework/` note, since the same
gap ("no rendering tooling, so this can't be tested") was one of the four
causes that record investigates.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-2008]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
