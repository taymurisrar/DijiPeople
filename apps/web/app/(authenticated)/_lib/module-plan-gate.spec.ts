import { isModuleOnPlan } from "./module-plan-gate";

describe("isModuleOnPlan", () => {
  it("renders a module the plan includes", () => {
    expect(isModuleOnPlan(["leave", "projects"], "projects")).toBe(true);
  });

  it("gates a module the plan does not include (DP-QA-001, DP-QA-003)", () => {
    expect(isModuleOnPlan(["leave", "attendance"], "projects")).toBe(false);
    expect(isModuleOnPlan([], "recruitment")).toBe(false);
  });

  it("fails open when the plan could not be read; the API still refuses", () => {
    expect(isModuleOnPlan(null, "payroll")).toBe(true);
    expect(isModuleOnPlan(undefined, "payroll")).toBe(true);
  });
});
