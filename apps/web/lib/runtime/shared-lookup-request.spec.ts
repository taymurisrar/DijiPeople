import {
  clearSharedLookupRequests,
  sharedLookupRequest,
} from "./shared-lookup-request";

describe("sharedLookupRequest (DP-QA-025)", () => {
  beforeEach(() => clearSharedLookupRequests());

  it("makes one call for many identical concurrent requests", async () => {
    const load = jest.fn(async () => ["a"]);
    const results = await Promise.all(
      Array.from({ length: 22 }, () =>
        sharedLookupRequest("/api/locations", load),
      ),
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r[0] === "a")).toBe(true);
  });

  it("does not share different keys", async () => {
    const load = jest.fn(async () => []);
    await Promise.all([
      sharedLookupRequest("/api/locations", load),
      sharedLookupRequest("/api/departments", load),
    ]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("asks again after the window", async () => {
    const load = jest.fn(async () => []);
    let t = 0;
    await sharedLookupRequest("k", load, () => t);
    t = 20_000;
    await sharedLookupRequest("k", load, () => t);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never keeps a failure", async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error("403"))
      .mockResolvedValue(["ok"]);
    await expect(sharedLookupRequest("k", load)).rejects.toThrow("403");
    await expect(sharedLookupRequest("k", load)).resolves.toEqual(["ok"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("can be cleared after a write", async () => {
    const load = jest.fn(async () => []);
    await sharedLookupRequest("k", load);
    clearSharedLookupRequests();
    await sharedLookupRequest("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stays bounded when keys keep arriving", async () => {
    for (let i = 0; i < 1000; i += 1) {
      await sharedLookupRequest(`bound-${i}`, async () => i, () => 0);
    }
    // The newest key is still shared; the oldest was evicted and reloads.
    const load = jest.fn(async () => "fresh");
    await sharedLookupRequest("bound-999", load, () => 0);
    expect(load).not.toHaveBeenCalled();
    await sharedLookupRequest("bound-0", load, () => 0);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
