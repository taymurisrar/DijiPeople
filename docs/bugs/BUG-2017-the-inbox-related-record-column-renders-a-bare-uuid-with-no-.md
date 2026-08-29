---
ID: BUG-2017
aliases: [BUG-2017]
Title: The inbox Related record column renders a bare UUID with no label and no link
Status: OPEN
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2017 — The inbox Related record column renders a bare UUID with no label and no link

## Summary

Every cell on an inbox row is well formatted — a human title, a readable body,
module, category, priority, read state and a formatted date — except "Related
record", which prints the raw record id as plain text. It is neither a label nor
a link, so the one affordance that would let an approver jump from "Leave request
needs approval" to the request itself is missing, and the column shows the reader
nothing they can use.

## Expected Behavior

The Related record cell names the record — "Annual Leave, 07 Sep – 09 Sep" or at
minimum "Leave request" — and links to it, so an approver can act from the inbox
in one click.

## Actual Behavior

The cell renders the bare id as text:

```
fea7a460-6e29-4241-b55f-c0a20bef74bd
```

with no link and no label, on rows whose every other cell is correct:

```
"Leave request needs approval" / "Taimur Israr submitted Annual Leave leave."
    Leave | Approvals | priority 1 | Unread | 08/29/2026, 1:16 AM
    Related record: fea7a460-6e29-4241-b55f-c0a20bef74bd
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Cause a notification to be raised — submitting a leave request that routes to
   an approver is the easiest.
2. Open **Inbox** in the tenant workspace.
3. Read across a row. Title, body, module, category, priority, status and date
   all render correctly; the **Related record** cell shows a bare UUID.
4. Try to click it. It is not a link.

## Evidence

Observed live on the production demo tenant, with the id quoted above. The
contrast within the same row is the evidence: this is one unfinished cell, not a
broken screen. The filter tabs (All / Unread / Action Required / Approvals /
Employee / Attendance / Leave / Archived) all render, and the notification
pipeline behind the screen is working correctly.

No file:line evidence was collected; the inbox table component in `apps/web` was
not located during the run.

## Root Cause

Not established. The notification carries a related record id and, presumably, a
type; nothing resolves the pair into a label or a route.

## Impact

An approver reading the inbox cannot tell which record a row refers to without
copying the id somewhere else, and cannot navigate to it at all. That removes
most of the value of an action-required inbox: the queue tells you something
needs doing and then does not take you there.

Cosmetically it also leaks an internal identifier onto a screen every user sees.

Rated LOW: nothing is wrong, nothing is lost, and every other part of the screen
works — but it is on a daily-use surface and the fix is small, which is an
argument about priority rather than severity.

## Affected Areas

The Inbox screen in `apps/web` and whatever renders its Related record column;
the notification payload, if it does not currently carry enough to build a label
and a route.

## Proposed Resolution

Resolve the related record into a label and a link. The notification already
carries `moduleKey` and a related record id, so a per-module route resolver — the
same information the runtime module registry already holds — is enough to build
the href without a new API call. A label needs either a denormalised title on the
notification or a lookup; the denormalised title is cheaper and matches what the
notification body already does ("Taimur Israr submitted Annual Leave leave.").

This is adjacent to the raw-token cluster in BUG-2009, but it is not the same
fix: there the display-label lookup falls through to a key, here there is no
lookup and no link at all.

## Acceptance Criteria

- The Related record cell shows a human label, not a UUID.
- The cell links to the record, and the link opens the right record for at least
  the leave, approval and attendance notification types.
- No internal identifier is rendered as the sole content of a cell on the inbox.

## Regression Coverage

None yet. A rendering assertion is not possible in the `apps/web` unit suite
(`jest.config.js` is `testEnvironment: node`, no jsdom). Browser coverage exists
since ITEM-0034 (`e2e/tests/flow-h`, `flow-i`, `flow-j`, 2026-08-29) and could
carry an assertion about the inbox, but none of those flows opens `/inbox`. So
this is covered either by whatever resolver function the fix introduces —
testable as pure logic — or by the smoke check described in BUG-2003.

## Dependencies

None identified.

## Related Items

BUG-2016 is the other inbox defect from the same pass, and the two compound: a
stale row that cannot be navigated to is doubly useless. BUG-2009 is the
raw-token display cluster this resembles; the cause differs.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW.
- 2026-08-29 — Regression Coverage updated: browser E2E coverage for `apps/web` landed on `origin/develop` (ITEM-0034, 2026-08-29). No flow opens `/inbox`, so the jsdom gap is still what blocks a rendering assertion here.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
