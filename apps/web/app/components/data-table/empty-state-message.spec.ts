import { emptyStateMessage } from "./utils";

/*
 * BUG-1654. Every list in a freshly provisioned workspace read "No records
 * match the selected search or filters" with nothing searched and nothing
 * filtered. The first screen a paying customer saw told them a search they had
 * never run was hiding data that did not exist — next to a "Server unavailable"
 * dialog that was also false (BUG-1649). A healthy workspace looked broken.
 *
 * The ambiguity was already documented in the opposite direction:
 * standard-module-views.spec.ts exists because a view naming a field its module
 * lacks filters everything out, and this same sentence then "reads as 'there is
 * no data' rather than 'this view is broken'". One message served two opposite
 * states, so both readings were wrong.
 */

describe("data table empty state", () => {
  it("does not blame filters when none are applied", () => {
    // The first-run case: a provisioned tenant with no data at all.
    expect(emptyStateMessage(false)).toBe("No records yet.");
    expect(emptyStateMessage(false)).not.toMatch(/search|filter/i);
  });

  it("explains the filter when one is applied", () => {
    // The over-filtered case, including a view whose filters match nothing —
    // which is what standard-module-views.spec.ts guards from the other side.
    expect(emptyStateMessage(true)).toBe(
      "No records match the selected search or filters.",
    );
  });

  it("says something different in each state", () => {
    /*
     * The point of the fix. A single shared string is what made both readings
     * wrong, so the guard that matters is that the two states are
     * distinguishable at all — not the exact wording, which may well be
     * improved per module later.
     */
    expect(emptyStateMessage(true)).not.toBe(emptyStateMessage(false));
  });
});
