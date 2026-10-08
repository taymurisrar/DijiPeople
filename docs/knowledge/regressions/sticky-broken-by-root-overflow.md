# Sticky broken by root overflow

> Written at `32c4b314`. Narrative for REG-663 and BUG-4032.

## The shape

`position: sticky` sticks to the nearest **scroll container**, not to the
window. When `html` and `body` both carry a non-visible `overflow`, CSS
overflow propagation stops at `html`, and `body` becomes a scroll container of
its own: setting `overflow-x: hidden` makes its `overflow-y` compute to `auto`.
`body` is as tall as its content, so it never scrolls. The window scrolls
instead, and every sticky element on the page is pinned to a box that never
moves, so it scrolls away with the page.

Nothing errors. Every component's own CSS is correct, and its tests pass. The
defect is one global rule, far from any component that shows it.

## The instance

Platform Admin's `globals.css` had `html, body { overflow-x: hidden }` to stop
horizontal page scroll. As a result, nothing in the console could stick:

- the record command bar;
- the agreement editor's toolbar;
- the Fields & Signatures panel, which was out of reach from page two of any
  long agreement.

An earlier fix measured the page's chrome and set sticky offsets precisely. It
was correct and still did nothing, because the offsets were measured against
the wrong box.

## How to recognise it

Walk up from the sticky element and print `overflow-x/overflow-y` for each
ancestor, **including `body` and `html`**. A check that stops at `body` misses
it. The tell-tale is `hidden/auto` on both `html` and `body`.

## The fix

Use `overflow-x: clip`. It still prevents horizontal scroll, but it does not
create a scroll container. `apps/admin/lib/sticky-scroll-container.spec.ts` was
mutation-tested: it fails when either root element goes back to `hidden`.

A related trap is that a sticky element cannot outlive its container. Near the
end of the agreement editor, a full-height rail was pushed up under the
toolbar, because the toolbar belongs to a taller container. The rail now caps
its height to the room left (`--contract-rail-room`) instead of sliding under
it.

## Related

- [[a-fix-wired-at-both-ends-only]] is the same family: every part is correct,
  and the path between them is not.
