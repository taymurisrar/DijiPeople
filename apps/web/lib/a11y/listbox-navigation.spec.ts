import {
  activeDescendantId,
  listboxOptionId,
  nextActiveIndex,
} from "./listbox-navigation";

describe("nextActiveIndex", () => {
  it("starts at the first option when nothing is highlighted", () => {
    expect(nextActiveIndex("ArrowDown", -1, 3)).toBe(0);
  });

  it("starts at the last option when arrowing up from nothing", () => {
    expect(nextActiveIndex("ArrowUp", -1, 3)).toBe(2);
  });

  it("wraps in both directions", () => {
    expect(nextActiveIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextActiveIndex("ArrowUp", 0, 3)).toBe(2);
  });

  it("jumps to the ends", () => {
    expect(nextActiveIndex("Home", 2, 3)).toBe(0);
    expect(nextActiveIndex("End", 0, 3)).toBe(2);
  });

  it("is not a movement for any other key", () => {
    for (const key of ["Enter", " ", "Escape", "Tab", "a"]) {
      expect([key, nextActiveIndex(key, 0, 3)]).toEqual([key, null]);
    }
  });

  it("moves nowhere in an empty list", () => {
    // A filtered lookup with no matches renders no listbox at all, so arrowing
    // must not produce an index that names an option which does not exist.
    expect(nextActiveIndex("ArrowDown", -1, 0)).toBeNull();
    expect(nextActiveIndex("Home", -1, 0)).toBeNull();
  });
});

describe("activeDescendantId", () => {
  it("names the highlighted option while the popup is open", () => {
    expect(activeDescendantId("lb", true, 1, 3)).toBe(listboxOptionId("lb", 1));
  });

  it("is undefined rather than a dangling reference", () => {
    // aria-activedescendant pointing at no element is itself a violation, which
    // is the shape of the defect this record is about: attributes written,
    // targets never rendered.
    expect(activeDescendantId("lb", false, 1, 3)).toBeUndefined();
    expect(activeDescendantId("lb", true, -1, 3)).toBeUndefined();
    expect(activeDescendantId("lb", true, 5, 3)).toBeUndefined();
  });
});
