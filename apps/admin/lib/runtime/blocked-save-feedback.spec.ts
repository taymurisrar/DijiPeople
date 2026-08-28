import {
  describeBlockedSave,
  errorCountByTab,
  firstFailingTab,
} from "./blocked-save-feedback";
import { getPlatformModuleDefinition } from "./platform-module-registry";

/*
 * BUG-1746 (and BUG-1546, the same defect recorded earlier).
 *
 * A multi-tab create form refused to save with "Complete the required fields."
 * while the visible tab looked complete and **no field anywhere in the DOM**
 * carried an error marker, because the failing field lived on a tab that was
 * not mounted. On the Partner form that was a total dead end.
 *
 * The invariant these assertions hold: a blocked save always points somewhere.
 */

const PARTNER_SHAPED = [
  { key: "displayName", label: "Partner name", tab: "summary" },
  { key: "email", label: "Business email", tab: "summary" },
  { key: "defaultCommissionRate", label: "Default commission", tab: "commercial" },
  { key: "currencyCode", label: "Currency", tab: "commercial" },
];

describe("blocked save feedback", () => {
  it("points at the tab holding the first failure, not the visible one", () => {
    const errors = { currencyCode: "Required" };
    expect(firstFailingTab(PARTNER_SHAPED, errors)).toBe("commercial");
  });

  it("counts failures per tab so the strip can mark them", () => {
    const errors = {
      defaultCommissionRate: "Required",
      currencyCode: "Required",
      displayName: "Required",
    };
    expect(errorCountByTab(PARTNER_SHAPED, errors)).toEqual(
      new Map([
        ["summary", 1],
        ["commercial", 2],
      ]),
    );
  });

  it("attributes a tabless field to the first tab rather than dropping it", () => {
    const fields = [{ key: "orphan", label: "Orphan" }];
    expect(errorCountByTab(fields, { orphan: "Required" }, "summary")).toEqual(
      new Map([["summary", 1]]),
    );
  });

  it("names the failing fields instead of only counting them", () => {
    expect(
      describeBlockedSave(PARTNER_SHAPED, { currencyCode: "Required" }),
    ).toBe("Complete the required fields: Currency.");
  });

  it("summarises rather than listing every field", () => {
    const errors = Object.fromEntries(
      PARTNER_SHAPED.map((field) => [field.key, "Required"]),
    );
    expect(describeBlockedSave(PARTNER_SHAPED, errors)).toBe(
      "Complete the required fields: Partner name, Business email, Default commission and 1 more.",
    );
  });

  it("falls back to the generic message when nothing has a label", () => {
    expect(describeBlockedSave([{ key: "x" }], { x: "Required" })).toBe(
      "Complete the required fields.",
    );
  });

  /*
   * The defect was reported against a real form, so it is asserted against one:
   * every required field the partner create form declares must sit on a tab the
   * feedback can name. A required field with no tab is invisible to both the
   * badge and the switch, which is the state that produced the dead end.
   */
  it("every required field on the real partner form is reachable", () => {
    const definition = getPlatformModuleDefinition("partners");
    for (const form of definition.forms) {
      if (!form.tabs?.length) continue;
      const required = form.fields.filter(
        (field) => field.required && !field.readOnly,
      );
      const errors = Object.fromEntries(
        required.map((field) => [field.key, "Required"]),
      );
      if (!required.length) continue;
      expect([form.key, firstFailingTab(form.fields, errors)]).not.toEqual([
        form.key,
        null,
      ]);
      const counted = [...errorCountByTab(form.fields, errors).values()].reduce(
        (total, count) => total + count,
        0,
      );
      expect([form.key, counted]).toEqual([form.key, required.length]);
    }
  });
});
