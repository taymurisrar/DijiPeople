import {
  buildAdapterCommandHandlers,
  DATA_MANAGEMENT_ROUTE,
} from "./module-adapter-command-handlers";
import type { CommandExecutionContext } from "./command-runtime.types";

/**
 * DP-QA-004: the Import command opened `/employees/import`, which no page serves.
 */
describe("system.import", () => {
  it("opens the data-management importer, not a per-module /import route", async () => {
    const navigate = jest.fn();
    const handlers = buildAdapterCommandHandlers({ navigate } as never);

    const result = await handlers["system.import"]({
      runtime: { module: { routeBase: "/employees" } },
    } as unknown as CommandExecutionContext);

    expect(navigate).toHaveBeenCalledWith("/settings/data-management");
    expect(DATA_MANAGEMENT_ROUTE).toBe("/settings/data-management");
    expect(result).toMatchObject({ redirectTo: "/settings/data-management" });
  });
});
