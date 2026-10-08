import type { RuntimeActionDefinition } from "./platform-runtime.types";

/*
 * Which commands stay on the bar and which go into More.
 *
 * More used to exist whenever the registry had placed any action in
 * `placement: "overflow"`, so a record with six commands and a whole empty row
 * beside them still hid Delete behind a menu. The bar now measures itself: every
 * command is drawn inline while it fits, and only the ones that genuinely do
 * not fit move into More — lowest priority first. Widen the window and they
 * come back.
 *
 * Kept free of the DOM so the decision is tested without a layout engine.
 */

/**
 * Lower is more important. A primary business action and the commands an
 * operator reaches for on every record (Back, Save, Edit, New) are the last to
 * leave the bar; what the registry used to banish to the menu outright, and
 * destructive commands, are the first.
 */
export function commandPriority(action: RuntimeActionDefinition) {
  if (action.placement === "primary") return 0;
  if (["back", "save", "save-close", "edit"].includes(action.key)) return 1;
  if (["new", "refresh"].includes(action.key)) return 2;
  if (action.destructive) return 5;
  if (action.placement === "overflow") return 4;
  return 3;
}

/**
 * The commands in display order: everything the registry placed inline first,
 * then what it marked as overflow-by-default, each keeping its declared order.
 */
export function orderCommands(actions: RuntimeActionDefinition[]) {
  return [
    ...actions.filter((action) => action.placement !== "overflow"),
    ...actions.filter((action) => action.placement === "overflow"),
  ];
}

/**
 * Split `actions` (already in display order) into what is drawn inline and what
 * goes into More.
 *
 * @param widths measured width of each action's inline button, same order
 * @param available width of the space the buttons sit in
 * @param moreWidth width of the More button
 * @param gap horizontal gap between buttons
 */
export function fitCommands<T extends RuntimeActionDefinition>(
  actions: T[],
  widths: number[],
  available: number,
  moreWidth: number,
  gap: number,
): { inline: T[]; overflow: T[] } {
  const total = (indexes: number[]) =>
    indexes.reduce((sum, index) => sum + (widths[index] ?? 0), 0) +
    Math.max(indexes.length - 1, 0) * gap;
  const all = actions.map((_, index) => index);
  /*
   * A sub-pixel of tolerance: measured widths are fractional, and a bar that
   * fits exactly must not flip to More because 0.4px rounded the wrong way.
   */
  if (total(all) <= available + 0.5) return { inline: actions, overflow: [] };

  const budget = available - moreWidth - gap;
  const byPriority = [...all].sort(
    (a, b) =>
      commandPriority(actions[a]!) - commandPriority(actions[b]!) || a - b,
  );
  const kept: number[] = [];
  /*
   * Stops at the first command that does not fit rather than skipping it for
   * a narrower one further down: a lower-priority command must never stay on
   * the bar while a more important one is in the menu.
   */
  for (const index of byPriority) {
    if (total([...kept, index]) > budget + 0.5) break;
    kept.push(index);
  }
  const keep = new Set(kept);
  return {
    inline: actions.filter((_, index) => keep.has(index)),
    overflow: actions.filter((_, index) => !keep.has(index)),
  };
}
