import {
  employeeRecordHref,
  INITIAL_HIERARCHY_CARD_STATE,
  reduceHierarchyCard,
  resolveHierarchyCardPosition,
  resolveHierarchyTapIntent,
  type HierarchyCardEvent,
  type HierarchyCardState,
} from "./employee-hierarchy-tree";

/*
 * BUG-3499 — the hierarchy dialog opened with the root's card already showing,
 * a tap on any node showed nothing (focus opened the card, the click toggled
 * it shut), and the card was clipped by the dialog's scroll containers.
 */

function run(...events: HierarchyCardEvent[]): HierarchyCardState {
  return events.reduce(reduceHierarchyCard, INITIAL_HIERARCHY_CARD_STATE);
}

describe("hierarchy detail card state", () => {
  it("shows no card until something happens", () => {
    expect(INITIAL_HIERARCHY_CARD_STATE.activeNodeId).toBeNull();
  });

  it("shows the hovered node's card and hides it when the pointer leaves", () => {
    expect(run({ type: "pointer-enter", nodeId: "zaid" }).activeNodeId).toBe(
      "zaid",
    );
    expect(
      run(
        { type: "pointer-enter", nodeId: "zaid" },
        { type: "pointer-leave", nodeId: "zaid" },
      ).activeNodeId,
    ).toBeNull();
  });

  it("moves the card to another node while one is showing", () => {
    // The walkthrough: with the root's card up, hovering another node did nothing.
    const state = run(
      { type: "focus", nodeId: "root" },
      { type: "pointer-enter", nodeId: "rania" },
    );
    expect(state.activeNodeId).toBe("rania");
  });

  it("does not let a stale blur close the card another node opened", () => {
    const state = run(
      { type: "focus", nodeId: "root" },
      { type: "pointer-enter", nodeId: "rania" },
      { type: "blur", nodeId: "root" },
    );
    expect(state.activeNodeId).toBe("rania");
  });

  it("keeps a tapped card open after focus already opened it", () => {
    // The old defect: focus opened, the click's toggle closed it again.
    const state = run(
      { type: "focus", nodeId: "zaid" },
      { type: "tap", nodeId: "zaid", wasActiveAtPointerDown: false },
    );
    expect(state).toEqual({ activeNodeId: "zaid", pinnedByTap: true });
  });

  it("keeps a tap-opened card when the touch pointer leaves", () => {
    const state = run(
      { type: "tap", nodeId: "zaid", wasActiveAtPointerDown: false },
      { type: "pointer-leave", nodeId: "zaid" },
    );
    expect(state.activeNodeId).toBe("zaid");
  });

  it("clears on dismiss", () => {
    expect(
      run({ type: "focus", nodeId: "zaid" }, { type: "dismiss" }).activeNodeId,
    ).toBeNull();
  });
});

describe("what activating a node does", () => {
  it("opens the record for mouse and keyboard activation", () => {
    expect(
      resolveHierarchyTapIntent({
        pointerType: "mouse",
        wasActiveAtPointerDown: false,
      }),
    ).toBe("navigate");
    expect(
      resolveHierarchyTapIntent({
        pointerType: null,
        wasActiveAtPointerDown: false,
      }),
    ).toBe("navigate");
  });

  it("shows the card on the first tap and opens the record on the second", () => {
    expect(
      resolveHierarchyTapIntent({
        pointerType: "touch",
        wasActiveAtPointerDown: false,
      }),
    ).toBe("show-card");
    expect(
      resolveHierarchyTapIntent({
        pointerType: "touch",
        wasActiveAtPointerDown: true,
      }),
    ).toBe("navigate");
  });

  it("links a node to that employee's record", () => {
    expect(employeeRecordHref("a b")).toBe("/employees/a%20b");
  });
});

describe("hierarchy card placement", () => {
  const viewport = { width: 1024, height: 768 };
  const card = { width: 224, height: 120 };

  it("places the card below the node when it fits", () => {
    const position = resolveHierarchyCardPosition({
      anchor: { top: 100, left: 400, width: 112, height: 80 },
      card,
      viewport,
    });
    expect(position.placement).toBe("below");
    expect(position.top).toBe(188);
    expect(position.left).toBe(400 + 56 - 112);
  });

  it("flips above a node near the bottom of the viewport", () => {
    const position = resolveHierarchyCardPosition({
      anchor: { top: 640, left: 400, width: 112, height: 80 },
      card,
      viewport,
    });
    expect(position.placement).toBe("above");
    expect(position.top + card.height).toBeLessThanOrEqual(640);
  });

  it("never cuts the card off at the left or right edge", () => {
    // The walkthrough: the root's card was cut off on the left.
    const atLeft = resolveHierarchyCardPosition({
      anchor: { top: 100, left: 0, width: 112, height: 80 },
      card,
      viewport,
    });
    const atRight = resolveHierarchyCardPosition({
      anchor: { top: 100, left: 990, width: 112, height: 80 },
      card,
      viewport,
    });
    expect(atLeft.left).toBeGreaterThanOrEqual(8);
    expect(atRight.left + card.width).toBeLessThanOrEqual(viewport.width - 8);
  });
});
