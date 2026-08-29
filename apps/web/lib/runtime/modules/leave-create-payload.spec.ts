/*
 * BUG-1965 — what the leave form actually POSTs.
 *
 * `SubmitLeaveRequestDto` whitelists neither `ownerId` nor `status`, and the API
 * runs its ValidationPipe with `forbidNonWhitelisted: true`, so either one in
 * the body is a 400 and the request is never created. Both reached it: the
 * record-status header supplies the owner, and `/leaves/new` seeds the draft
 * with a literal `record={{ status: "PENDING" }}`.
 *
 * The assertion is on the request body rather than on the spec's field flags,
 * because marking only `ownerId` read-only looked like a fix and was not —
 * `sanitizeStandardMutationValues` keeps every writable field present in the
 * draft, so `status` still went. A test reading the flags would have passed.
 */
import { createStandardModuleDataAdapter } from "./standard-module-data.adapter";
import { leaveRuntimeSpec } from "./standard-module-specs";

describe("leave request create payload", () => {
  const originalFetch = global.fetch;
  let captured: { url: string; body: Record<string, unknown> } | null = null;

  beforeEach(() => {
    captured = null;
    global.fetch = (async (url: string, init?: RequestInit) => {
      captured = {
        url: String(url),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      };
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "leave-1" }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("omits ownerId and status even when the draft carries both", async () => {
    const adapter = createStandardModuleDataAdapter(leaveRuntimeSpec);

    await adapter.create(
      {} as Parameters<typeof adapter.create>[0],
      {
        // Exactly what the runtime hands over: the user's four answers, plus the
        // owner from the record-status header and the status seeded by the page.
        leaveTypeId: "type-1",
        startDate: "2026-09-07",
        endDate: "2026-09-09",
        reason: "Family trip",
        ownerId: "user-1",
        status: "PENDING",
      },
    );

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("/api/leave-requests");
    expect(captured!.body).not.toHaveProperty("ownerId");
    expect(captured!.body).not.toHaveProperty("status");
  });

  it("still sends the four fields the request is actually made of", async () => {
    const adapter = createStandardModuleDataAdapter(leaveRuntimeSpec);

    await adapter.create({} as Parameters<typeof adapter.create>[0], {
      leaveTypeId: "type-1",
      startDate: "2026-09-07",
      endDate: "2026-09-09",
      reason: "Family trip",
      ownerId: "user-1",
      status: "PENDING",
    });

    expect(captured!.body).toMatchObject({
      leaveTypeId: "type-1",
      startDate: "2026-09-07",
      endDate: "2026-09-09",
      reason: "Family trip",
    });
  });
});
