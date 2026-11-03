import { loadCustomModuleRecords } from "./custom-module-api";
import { serverViewKey } from "./custom-module-runtime";

const apiRequestJson = jest.fn();

jest.mock("@/lib/server-api", () => {
  class ApiRequestError extends Error {
    constructor(readonly status: number) {
      super(`HTTP ${status}`);
    }
  }
  return {
    ApiRequestError,
    apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiRequestError } = require("@/lib/server-api") as {
  ApiRequestError: new (status: number) => Error;
};

beforeEach(() => apiRequestJson.mockReset());

describe("loadCustomModuleRecords", () => {
  it("sends the page, page size and ONLY the view key — never a filter", async () => {
    apiRequestJson.mockResolvedValue({ items: [] });
    await loadCustomModuleRecords("deal", {
      page: 3,
      pageSize: 25,
      view: "activeRecords",
    });
    const url = new URL(`http://x${apiRequestJson.mock.calls[0][0]}`);
    expect(url.pathname).toBe("/data/deal");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "3",
      pageSize: "25",
      view: "activeRecords",
    });
  });

  it("omits view when there is none (a module published without views)", async () => {
    apiRequestJson.mockResolvedValue({ items: [] });
    await loadCustomModuleRecords("deal", { page: 1, pageSize: 25 });
    expect(apiRequestJson.mock.calls[0][0]).not.toContain("view=");
  });

  it("maps 403 to forbidden and 404 to not-found", async () => {
    apiRequestJson.mockRejectedValueOnce(new ApiRequestError(403));
    await expect(
      loadCustomModuleRecords("deal", { page: 1, pageSize: 25, view: "v" }),
    ).resolves.toEqual({ status: "forbidden" });
    apiRequestJson.mockRejectedValueOnce(new ApiRequestError(404));
    await expect(
      loadCustomModuleRecords("deal", { page: 1, pageSize: 25, view: "v" }),
    ).resolves.toEqual({ status: "not-found" });
  });

  it("a 400 (a view the API refused to evaluate) is an ERROR, never 'not found' and never all records", async () => {
    apiRequestJson.mockRejectedValue(new ApiRequestError(400));
    await expect(
      loadCustomModuleRecords("deal", { page: 1, pageSize: 25, view: "bad" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("serverViewKey", () => {
  const definition = {
    views: [{ viewKey: "all" }, { viewKey: "activeRecords" }],
  } as never;

  it("returns the key of a published view", () => {
    expect(serverViewKey(definition, { logicalName: "activeRecords" })).toBe(
      "activeRecords",
    );
  });

  it("returns undefined for the synthetic list of a module with no published views", () => {
    expect(
      serverViewKey({ views: [] } as never, { logicalName: "all" }),
    ).toBeUndefined();
    expect(serverViewKey(definition, { logicalName: "ghost" })).toBeUndefined();
    expect(serverViewKey(definition, null)).toBeUndefined();
  });
});
