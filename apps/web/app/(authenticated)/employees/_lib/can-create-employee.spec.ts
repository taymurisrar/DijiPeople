import { canCreateEmployee } from "./can-create-employee";

describe("canCreateEmployee (DP-QA-021)", () => {
  it("admits a user holding employees.create", () => {
    expect(canCreateEmployee({ permissionKeys: ["employees.create"] })).toBe(true);
  });

  it("refuses an employee-level user", () => {
    expect(
      canCreateEmployee({ permissionKeys: ["employees.read", "dashboard.view"] }),
    ).toBe(false);
  });

  it("refuses a missing or empty session", () => {
    expect(canCreateEmployee(null)).toBe(false);
    expect(canCreateEmployee(undefined)).toBe(false);
    expect(canCreateEmployee({ permissionKeys: null })).toBe(false);
  });
});
