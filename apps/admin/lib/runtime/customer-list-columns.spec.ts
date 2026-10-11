import { getPlatformModuleDefinition } from "./platform-module-registry";

/*
 * The customers list showed empty Onboarding, Contracts and Owner cells because
 * the columns bound to paths the list API never returned. The API now returns
 * `_count.{contracts,onboardings}` and `assignedToUser.fullName`; this pins the
 * registry to those paths so the two cannot drift apart again.
 */
describe("customers list columns", () => {
  const columns = getPlatformModuleDefinition("customers").columns;
  const keys = columns.map((column) => column.key);

  it("binds counts to the API's _count object", () => {
    expect(keys).toContain("_count.onboardings");
    expect(keys).toContain("_count.contracts");
    expect(keys).not.toContain("onboardings");
    expect(keys).not.toContain("contracts");
  });

  it("shows the owner by full name", () => {
    expect(keys).toContain("assignedToUser.fullName");
  });
});
