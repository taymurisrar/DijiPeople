import { isSafeModuleHref } from "./module-href";

describe("isSafeModuleHref (DP-QA-035)", () => {
  it("lets a module command open its own pages", () => {
    expect(isSafeModuleHref("/employees/new", "/employees")).toBe(true);
  });

  it("lets Import reach Settings > Data Management from any module", () => {
    expect(isSafeModuleHref("/settings/data-management", "/employees")).toBe(true);
    expect(isSafeModuleHref("/settings/data-management", "/attendance")).toBe(true);
  });

  it("does not widen the exception to other settings or to a longer path", () => {
    expect(isSafeModuleHref("/settings/branding", "/employees")).toBe(false);
    expect(isSafeModuleHref("/settings/data-management/../access", "/employees")).toBe(false);
    expect(isSafeModuleHref("/settings/data-management-evil", "/employees")).toBe(false);
  });

  it("still refuses traversal and auth routes", () => {
    expect(isSafeModuleHref("/employees/../admin", "/employees")).toBe(false);
    expect(isSafeModuleHref("/employees/logout", "/employees")).toBe(false);
    expect(isSafeModuleHref("https://evil.example", "/employees")).toBe(false);
  });
});
