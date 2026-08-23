import { planEntitlementKeys } from "./plan-entitlement-keys";

describe("planEntitlementKeys", () => {
  it("reads the PlanFeature row shape returned by the runtime GET", () => {
    expect(
      planEntitlementKeys([
        { featureKey: "employees", isEnabled: true },
        { featureKey: "leave", isEnabled: true },
      ]),
    ).toEqual(["employees", "leave"]);
  });

  it("reads the key-array shape returned by the runtime PATCH", () => {
    /*
     * The regression. `mapPlan` returns `features: string[]`, so after any save
     * the record page held strings where it expected rows — and mapped
     * `.featureKey` over them, which is `undefined` on every element.
     */
    expect(planEntitlementKeys(["employees", "leave"])).toEqual([
      "employees",
      "leave",
    ]);
  });

  it("drops a disabled row but keeps a bare key", () => {
    expect(
      planEntitlementKeys([
        { featureKey: "employees", isEnabled: true },
        { featureKey: "payroll", isEnabled: false },
      ]),
    ).toEqual(["employees"]);
    // Nothing in the string shape can be disabled — it is filtered server-side.
    expect(planEntitlementKeys(["payroll"])).toEqual(["payroll"]);
  });

  it("never invents or silently empties a set it cannot read", () => {
    expect(planEntitlementKeys(undefined)).toEqual([]);
    expect(planEntitlementKeys(null)).toEqual([]);
    expect(planEntitlementKeys("employees")).toEqual([]);
    expect(planEntitlementKeys([{ isEnabled: true }, 42, null])).toEqual([]);
  });
});
