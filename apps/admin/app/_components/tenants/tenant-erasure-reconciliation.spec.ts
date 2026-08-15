import {
  TenantControlPlaneError,
  isTransportFailure,
  reconcileWithErasureReceipt,
} from "./tenant-control-plane.client";

/**
 * What the UI does when the erase response never arrives.
 *
 * This exists because an operator saw a bare 502 and had no way to tell whether
 * the tenant had been erased. Erasure runs in one long transaction behind a
 * proxy; a dropped response says nothing about whether the work committed. The
 * receipt is written before anything is deleted and outlives the tenant, so it
 * is the only thing that can answer.
 */
describe("transport failure detection", () => {
  it("treats gateway statuses as a lost response, not a refusal", () => {
    for (const status of [502, 503, 504]) {
      expect(
        isTransportFailure(new TenantControlPlaneError("Bad Gateway", status)),
      ).toBe(true);
    }
  });

  it("treats a network-level throw as a lost response", () => {
    expect(isTransportFailure(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not treat a refusal by the API as a lost response", () => {
    for (const status of [400, 403, 404, 409, 500]) {
      expect(
        isTransportFailure(new TenantControlPlaneError("Refused", status)),
      ).toBe(false);
    }
  });
});

describe("reconciling an erasure against its receipt", () => {
  const originalFetch = global.fetch;

  function mockReceipts(payload: unknown, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(payload),
    }) as unknown as typeof fetch;
  }

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reports success when the receipt says the erasure completed", async () => {
    mockReceipts([
      {
        id: "receipt-1",
        status: "COMPLETED",
        failureMessage: null,
        requestedAt: "2026-08-15T00:00:00.000Z",
      },
    ]);

    const outcome = await reconcileWithErasureReceipt("tenant-1");

    expect(outcome.erased).toBe(true);
    expect(outcome.message).toMatch(/completed/i);
  });

  it("reports the recorded reason when the receipt says it failed", async () => {
    mockReceipts([
      {
        id: "receipt-1",
        status: "FAILED",
        failureMessage: "violates RESTRICT setting of foreign key constraint",
        requestedAt: "2026-08-15T00:00:00.000Z",
      },
    ]);

    const outcome = await reconcileWithErasureReceipt("tenant-1");

    expect(outcome.erased).toBe(false);
    expect(outcome.message).toContain("nothing was deleted");
    expect(outcome.message).toContain("RESTRICT");
  });

  it("says the erasure never started when no receipt exists", async () => {
    mockReceipts([]);

    const outcome = await reconcileWithErasureReceipt("tenant-1");

    expect(outcome.erased).toBe(false);
    expect(outcome.message).toMatch(/nothing was deleted/i);
    expect(outcome.message).toMatch(/safe to retry/i);
  });

  it("says it is still running while the receipt is in progress", async () => {
    mockReceipts([
      {
        id: "receipt-1",
        status: "IN_PROGRESS",
        failureMessage: null,
        requestedAt: "2026-08-15T00:00:00.000Z",
      },
    ]);

    const outcome = await reconcileWithErasureReceipt("tenant-1");

    expect(outcome.erased).toBe(false);
    expect(outcome.message).toMatch(/still running/i);
  });

  it("never claims success when the receipts cannot be read", async () => {
    mockReceipts(null, false);

    const outcome = await reconcileWithErasureReceipt("tenant-1");

    expect(outcome.erased).toBe(false);
    expect(outcome.message).toMatch(/could not be read/i);
  });

  it("never claims success when the receipt request itself throws", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    const outcome = await reconcileWithErasureReceipt("tenant-1");

    expect(outcome.erased).toBe(false);
  });
});

describe("TenantControlPlaneError", () => {
  it("quotes the trace reference so it can be matched to a server log", () => {
    const error = new TenantControlPlaneError(
      "Tenant erasure failed",
      400,
      "req_abc123",
      "VALIDATION_FAILED",
    );
    expect(error.describe()).toBe(
      "Tenant erasure failed (reference req_abc123)",
    );
  });

  it("omits the reference when the API did not supply one", () => {
    expect(new TenantControlPlaneError("Boom", 500).describe()).toBe("Boom");
  });
});
