/**
 * Keyboard movement for a combobox that owns a listbox.
 *
 * BUG-1956 — the tenant product's shared lookup and select fields announced
 * themselves as comboboxes controlling a listbox and then presented a plain
 * `div` of `button` elements: no `role="listbox"`, no `role="option"`, no
 * `aria-activedescendant`. A screen-reader user was told a list existed and
 * given nothing to perceive or move through.
 *
 * The movement is a pure function of the key, the current index and the number
 * of options, so it is here rather than inside a component: it is the part
 * worth asserting, and both fields must behave identically or the two controls
 * diverge in exactly the way that produced the defect.
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
