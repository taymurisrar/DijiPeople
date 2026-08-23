import {
  mergeVisibleColumns,
  normalizeColumnOrder,
} from "@/app/_components/runtime/runtime-module-list";
import type { RuntimeColumnDefinition } from "./platform-runtime.types";

/**
 * Why a list stops looking like the module it belongs to.
 *
 * Every runtime list persists the operator's table state — which columns are
 * visible, in what order — and reapplies it on load. That state is written
 * against whatever the module offered on the day it was saved, and modules gain
 * columns.
 *
 * The reapplication used to be verbatim. `visibleColumns` from the saved state
 * became the visible set outright, so a column added to the definition
 * afterwards was absent from it and therefore hidden — permanently, silently,
 * and only for the operators who use the screen enough to have saved anything.
 * `normalizeColumnOrder` then appended anything unknown to the far right, so a
 * column the definition put first arrived last.
 *
 * Both together are how "the tenant list doesn't look updated" happens: the
 * definition was right, the deploy landed, and the screen kept showing the
 * module as it stood months earlier. Nothing failed, and the only route to the
 * missing columns was the column picker.
 *
 * `columnOrder` is what makes this recoverable: it lists every column the saved
 * state knew about, hidden ones included, so "never offered" and "deliberately
 * turned off" can be told apart.
 */

function columns(
  ...specs: Array<[key: string, visible?: boolean]>
): RuntimeColumnDefinition[] {
  return specs.map(
    ([key, visible]) =>
      ({
        key,
        field: key,
        label: key,
        width: 160,
        format: "text",
        sortable: true,
        filterable: true,
        visible: visible ?? true,
      }) as RuntimeColumnDefinition,
  );
}

describe("mergeVisibleColumns", () => {
  it("shows a column added since the operator last saved", () => {
    // The regression. `environment` is new; the saved state has never heard of
    // it, and hiding it is not a preference anybody expressed.
    const merged = mergeVisibleColumns(
      ["name", "status"],
      ["name", "status"],
      columns(["name"], ["environment"], ["status"]),
    );
    expect(merged).toEqual(["name", "environment", "status"]);
  });

  it("keeps honouring a column the operator turned off", () => {
    // Present in the saved order, absent from the saved visible set: that is a
    // decision, and re-showing it would be as wrong as hiding a new one.
    const merged = mergeVisibleColumns(
      ["name"],
      ["name", "status"],
      columns(["name"], ["status"]),
    );
    expect(merged).toEqual(["name"]);
  });

  it("respects a new column that ships hidden by default", () => {
    const merged = mergeVisibleColumns(
      ["name"],
      ["name"],
      columns(["name"], ["tenantCode", false]),
    );
    expect(merged).toEqual(["name"]);
  });

  it("drops a saved column the module no longer has", () => {
    const merged = mergeVisibleColumns(
      ["name", "removed"],
      ["name", "removed"],
      columns(["name"]),
    );
    expect(merged).toEqual(["name"]);
  });

  it("falls back to definition visibility when no order was saved", () => {
    /*
     * An older save carries no `columnOrder`, so nothing distinguishes "hidden
     * on purpose" from "did not exist yet". Showing what the module currently
     * offers is the reading that recovers; the alternative silently freezes the
     * screen at whatever it was.
     */
    const merged = mergeVisibleColumns(
      ["name"],
      [],
      columns(["name"], ["environment"], ["tenantCode", false]),
    );
    expect(merged).toEqual(["name", "environment"]);
  });

  it("returns columns in definition order, not saved order", () => {
    // The visible set is a set; ordering is `columnOrder`'s job. Returning it
    // in saved order would let the two disagree.
    const merged = mergeVisibleColumns(
      ["status", "name"],
      ["status", "name"],
      columns(["name"], ["status"]),
    );
    expect(merged).toEqual(["name", "status"]);
  });
});

describe("normalizeColumnOrder", () => {
  it("places a new first column first, not last", () => {
    /*
     * "Tenant name should be the first data column." It is first in the
     * definition; appending put it last for anyone with saved state.
     */
    expect(
      normalizeColumnOrder(
        ["status", "createdAt"],
        ["name", "status", "createdAt"],
      ),
    ).toEqual(["name", "status", "createdAt"]);
  });

  it("inserts a new column beside its definition neighbour", () => {
    expect(
      normalizeColumnOrder(
        ["name", "status"],
        ["name", "workspace", "status"],
      ),
    ).toEqual(["name", "workspace", "status"]);
  });

  it("keeps the operator's own reordering of columns they know", () => {
    // Deliberate reordering survives; only unknown columns are placed.
    expect(
      normalizeColumnOrder(["status", "name"], ["name", "status"]),
    ).toEqual(["status", "name"]);
  });

  it("drops columns the module no longer defines", () => {
    expect(normalizeColumnOrder(["name", "gone"], ["name"])).toEqual(["name"]);
  });

  it("is idempotent once the saved order already matches", () => {
    const available = ["name", "workspace", "status"];
    const once = normalizeColumnOrder(available, available);
    expect(normalizeColumnOrder(once, available)).toEqual(once);
  });

  it("places several new columns in their definition order", () => {
    expect(
      normalizeColumnOrder(["status"], ["name", "workspace", "status", "size"]),
    ).toEqual(["name", "workspace", "status", "size"]);
  });
});
