import assert from "node:assert/strict";
import {
  FORM_LAYOUT_GRID_TEST_SCENARIOS,
  getEffectiveFormGridColumnCount,
  normalizeFormGridColumn,
  normalizeFormGridColumnCount,
  normalizeFormGridColumnSpan,
} from "./form-layout-grid.ts";

assert.equal(normalizeFormGridColumnCount(undefined), 1);
assert.equal(normalizeFormGridColumnCount("2"), 2);
assert.equal(normalizeFormGridColumnCount(3), 3);
assert.equal(normalizeFormGridColumnCount(4), 3);
assert.equal(normalizeFormGridColumnCount(-1), 1);

assert.equal(normalizeFormGridColumnSpan(undefined, 3), 1);
assert.equal(normalizeFormGridColumnSpan("2", 3), 2);
assert.equal(normalizeFormGridColumnSpan(3, 3), 3);
assert.equal(normalizeFormGridColumnSpan(3, 2), 2);
assert.equal(normalizeFormGridColumnSpan(0, 3), 1);

assert.equal(normalizeFormGridColumn(undefined, 3), null);
assert.equal(normalizeFormGridColumn(1, 3), 1);
assert.equal(normalizeFormGridColumn(9, 3), 3);

assert.equal(getEffectiveFormGridColumnCount(3, 960), 3);
assert.equal(getEffectiveFormGridColumnCount(3, 640), 2);
assert.equal(getEffectiveFormGridColumnCount(3, 360), 1);
assert.equal(getEffectiveFormGridColumnCount(2, 960), 2);
assert.equal(getEffectiveFormGridColumnCount(2, 360), 1);
assert.equal(getEffectiveFormGridColumnCount(1, 960), 1);

assert.equal(FORM_LAYOUT_GRID_TEST_SCENARIOS.length >= 11, true);
