/**
 * Keyboard movement for a combobox that owns a listbox.
 *
 * BUG-3377 — the tenant product's shared lookup and select fields had this
 * exact defect (BUG-1956) and it was fixed there first, at
 * `apps/web/lib/a11y/listbox-navigation.ts`. The fix never reached Platform
 * Admin because it scoped itself to one file in one app; this is that same
 * logic, ported rather than reinvented. `apps/admin` has no shared package
 * with `apps/web` beyond `@repo/ui` (button/card/code only — root
 * `AGENTS.md`), so duplicating this ~50-line pure module is the pragmatic
 * choice over adding a new cross-app package for it. Keep the two in sync by
 * hand; a change to one almost certainly belongs in the other.
 *
 * The movement is a pure function of the key, the current index and the
 * number of options, so it is here rather than inside a component: it is the
 * part worth asserting, and every composite control in this app must behave
 * identically or they diverge in exactly the way that produced the defect.
 */

export type ListboxNavigationKey =
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End"
  | (string & {});

/**
 * The index a key press moves to, or `null` when the key is not a movement.
 *
 * `activeIndex` of `-1` means nothing is highlighted yet, which is the state a
 * freshly opened popup is in. Movement wraps, because a list a user cannot get
 * back to the top of is a list they have to close and reopen.
 */
export function nextActiveIndex(
  key: ListboxNavigationKey,
  activeIndex: number,
  optionCount: number,
): number | null {
  if (optionCount <= 0) return null;

  switch (key) {
    case "ArrowDown":
      return activeIndex < 0 ? 0 : (activeIndex + 1) % optionCount;
    case "ArrowUp":
      return activeIndex < 0
        ? optionCount - 1
        : (activeIndex - 1 + optionCount) % optionCount;
    case "Home":
      return 0;
    case "End":
      return optionCount - 1;
    default:
      return null;
  }
}

/** The id of one option, derived from the listbox's own id so both agree. */
export function listboxOptionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}

/**
 * What `aria-activedescendant` should be: the highlighted option's id while the
 * popup is open, and nothing otherwise. A dangling reference is its own
 * violation, so this returns `undefined` rather than an id that resolves to no
 * element.
 */
export function activeDescendantId(
  listboxId: string,
  isOpen: boolean,
  activeIndex: number,
  optionCount: number,
) {
  if (!isOpen || activeIndex < 0 || activeIndex >= optionCount) return undefined;
  return listboxOptionId(listboxId, activeIndex);
}
