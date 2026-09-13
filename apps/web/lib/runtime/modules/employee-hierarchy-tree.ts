/**
 * BUG-3499 — the reporting hierarchy dialog's interaction rules, as pure
 * functions so they can be tested without a DOM (`apps/web` jest has none).
 *
 * What went wrong, and which rule below answers it:
 *
 * - The shared dialog focuses its first focusable element on open. That was
 *   the root node, whose `onFocus` opened its card — so a card was showing
 *   before the user did anything. The dialog now puts its Close control first;
 *   the reducer still only opens a card for an explicit event.
 * - One control both opened on focus and toggled on click. A click focuses
 *   first (open) and then toggles (closed), so tapping never showed a card.
 *   Tap is now its own event: the first tap on a node shows its card, a tap on
 *   the node whose card is already showing opens the record.
 * - The card was absolutely positioned inside two scroll containers and an
 *   `overflow-hidden` panel, so it was clipped and extended the scroll area
 *   instead of overlaying. It is now placed in the viewport by
 *   `resolveHierarchyCardPosition` and rendered in a portal.
 */

export type HierarchyCardState = {
  readonly activeNodeId: string | null;
  /* A card opened by tap stays until another node is chosen or it is dismissed. */
  readonly pinnedByTap: boolean;
};

export const INITIAL_HIERARCHY_CARD_STATE: HierarchyCardState = {
  activeNodeId: null,
  pinnedByTap: false,
};

export type HierarchyCardEvent =
  | { readonly type: "pointer-enter"; readonly nodeId: string }
  | { readonly type: "pointer-leave"; readonly nodeId: string }
  | { readonly type: "focus"; readonly nodeId: string }
  | { readonly type: "blur"; readonly nodeId: string }
  | {
      readonly type: "tap";
      readonly nodeId: string;
      readonly wasActiveAtPointerDown: boolean;
    }
  | { readonly type: "dismiss" };

export function reduceHierarchyCard(
  state: HierarchyCardState,
  event: HierarchyCardEvent,
): HierarchyCardState {
  switch (event.type) {
    case "pointer-enter":
    case "focus":
      return { activeNodeId: event.nodeId, pinnedByTap: false };
    case "pointer-leave":
      return state.activeNodeId === event.nodeId && !state.pinnedByTap
        ? INITIAL_HIERARCHY_CARD_STATE
        : state;
    case "blur":
      // A blur from a node that is no longer the active one must not close the
      // card another node has since opened.
      return state.activeNodeId === event.nodeId
        ? INITIAL_HIERARCHY_CARD_STATE
        : state;
    case "tap":
      return event.wasActiveAtPointerDown
        ? state
        : { activeNodeId: event.nodeId, pinnedByTap: true };
    case "dismiss":
      return INITIAL_HIERARCHY_CARD_STATE;
  }
}

/**
 * What activating a node does. A mouse or keyboard user already has hover or
 * focus to see the card, so activation opens the record. A touch user has
 * neither, so the first tap reveals the card and only a tap on the node whose
 * card is already showing navigates.
 */
export function resolveHierarchyTapIntent(input: {
  readonly pointerType: string | null;
  readonly wasActiveAtPointerDown: boolean;
}): "navigate" | "show-card" {
  if (input.pointerType !== "touch") return "navigate";
  return input.wasActiveAtPointerDown ? "navigate" : "show-card";
}

export type HierarchyRect = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Where the card goes, in viewport coordinates, so no scroll container can
 * clip it: below the node when it fits, above when it does not, and always
 * clamped inside the viewport's margins.
 */
export function resolveHierarchyCardPosition(input: {
  readonly anchor: HierarchyRect;
  readonly card: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly gap?: number;
  readonly margin?: number;
}): { readonly top: number; readonly left: number; readonly placement: "below" | "above" } {
  const gap = input.gap ?? 8;
  const margin = input.margin ?? 8;
  const { anchor, card, viewport } = input;

  const below = anchor.top + anchor.height + gap;
  const above = anchor.top - gap - card.height;
  const fitsBelow = below + card.height <= viewport.height - margin;
  const fitsAbove = above >= margin;
  const placement = fitsBelow || !fitsAbove ? "below" : "above";

  const maxTop = Math.max(margin, viewport.height - margin - card.height);
  const top = clamp(placement === "below" ? below : above, margin, maxTop);

  const maxLeft = Math.max(margin, viewport.width - margin - card.width);
  const left = clamp(
    anchor.left + anchor.width / 2 - card.width / 2,
    margin,
    maxLeft,
  );

  return { top, left, placement };
}

export function employeeRecordHref(employeeId: string) {
  return `/employees/${encodeURIComponent(employeeId)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
