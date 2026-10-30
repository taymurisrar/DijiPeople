import type { FormMetadata } from "../metadata-runtime.types";
import { filterEmployeeFormTabsByPlan } from "./employee-plan-tabs";

const tab = (tabKey: string) => ({
  id: tabKey,
  tabKey,
  label: tabKey,
  order: 1,
});
const form = {
  id: "f",
  tabs: [
    "summary",
    "attendance",
    "leave-history",
    "documents",
    "timesheets",
    "payroll-compensation",
    "pay-setup",
    "banking-details",
    "payslips",
    "project-allocations",
    "agent",
  ].map(tab),
} as unknown as FormMetadata;

const keysOf = (f: FormMetadata | null) => f?.tabs?.map((t) => t.tabKey);
const STARTER = [
  "employees",
  "organization",
  "leave",
  "attendance",
  "documents",
];

describe("filterEmployeeFormTabsByPlan (DP-QA-015)", () => {
  it("keeps only the Starter tabs on a Starter plan", () => {
    expect(keysOf(filterEmployeeFormTabsByPlan(form, STARTER))).toEqual([
      "summary",
      "attendance",
      "leave-history",
      "documents",
    ]);
  });

  it("restores each tab when its feature is on the plan", () => {
    const keys = keysOf(
      filterEmployeeFormTabsByPlan(form, [...STARTER, "payroll", "timesheets"]),
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "timesheets",
        "payroll-compensation",
        "pay-setup",
        "banking-details",
        "payslips",
      ]),
    );
    expect(keys).not.toContain("project-allocations");
  });

  it("leaves the form alone when the plan could not be read", () => {
    expect(filterEmployeeFormTabsByPlan(form, null)).toBe(form);
  });

  it("passes a missing form through", () => {
    expect(filterEmployeeFormTabsByPlan(null, STARTER)).toBeNull();
  });
});
