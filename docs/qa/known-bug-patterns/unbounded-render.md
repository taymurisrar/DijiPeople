# Bug pattern — `unbounded-render`

**A list that renders everything it was handed, and state that indexes a list it
no longer matches.**

Two failures that arrive in sequence, which is why they share a pattern: the
second one is introduced by the fix for the first.

## What it looks like

Stage one — the panel renders whatever the endpoint returned:

```tsx
<ol>{items.map((item) => <li key={item.id}>…</li>)}</ol>
```

Correct on the day it is written, because the tenant is a week old and has nine
entries. Nothing about the code changes when it has 154, and nothing on screen
says how many there are.

Stage two — paging is added, and the page number is held in state:

```tsx
const [page, setPage] = useState(1);
const pageItems = items.slice((page - 1) * SIZE, page * SIZE);
```

Filter to a category with two entries while sitting on page four and the panel
renders nothing, above a list that plainly has rows in it. Correcting `page`
from an effect does not fix it either — that still renders the broken frame once
before the correction lands.

## Why it is dangerous here

Admin record pages stack panels vertically. An unbounded list does not merely
look untidy; it pushes every panel below it past an arbitrary amount of scroll,
so the defect is *other features becoming unreachable* rather than one list
being long. And because the data is all present, nothing errors and nothing is
logged — the panel is working exactly as written.

The empty-page state is worse than the long list it replaced, because an empty
panel reads as "there is nothing here", which is false.

## How to detect it

- Any `.map()` over a fetched array with no `slice`, `take` or `limit` between
  them. Ask what the array length is on the oldest record in production, not the
  newest.
- Any `useState` holding an index, page or cursor into a list that a filter,
  a refetch or a delete can shorten. If the list can change without the state
  changing, they can disagree.
- A `useEffect` that clamps or resets such state is a signal, not a fix: it
  concedes the two can disagree and repairs it one render late.

## How to prevent it

- Show the total and the visible window — "Showing 1–25 of 154". A list without
  a count cannot be checked for completeness by the person reading it.
- Derive the window from the *current* list rather than storing it. A computed
  window cannot be stale by construction, which is a stronger guarantee than any
  amount of resetting.
- Treat the page number as a **request**, not a fact: clamp it into range at
  read time and let the render use the clamped value.

## Reviewer check

A list surface with no bound and no count is rejected. Paging state that indexes
a list which a filter can shorten must be clamped at read time, not corrected in
an effect.

## QA check

Page to the end, then narrow the filter. The panel must show rows, not an empty
state, and the pager must agree with what is on screen.

## Occurrences

| Ref | Where |
|---|---|
| REG-183 | `apps/admin/app/_components/tenants/tenant-timeline-panel.tsx` |
