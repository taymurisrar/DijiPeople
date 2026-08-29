/*
 * BUG-1965, fourth acceptance criterion — the record-status widget is shared, so
 * the question it raised is not leave's alone.
 *
 * The leave form was rejected because the widget serialised `ownerId` into the
 * create body and `SubmitLeaveRequestDto` forbids it. The widget renders on
 * every standard runtime module, and the owner of a record that does not exist
 * yet is never the client's to propose — `AGENTS.md` lists `createdById` beside
 * `tenantId` and `id` among the fields a client must never set.
 *
 * So this asserts the class rather than the instance: for every
 * StandardModuleRuntimeSpec, a draft carrying an owner — under its own owner
 * field name, and under both spellings the widget has used — produces a create
 * body with none of them. It is driven through the real adapter and asserts the
 * request body, for the reason the leave spec gives: a test reading the specs'
 * field flags would pass against a payload that still went out wrong.
 */
import { createStandardModuleDataAdapter } from "./standard-module-data.adapter";
import * as standardModuleSpecs from "./standard-module-specs";
import type { StandardModuleRuntimeSpec } from "./standard-module-runtime";

const specs = Object.entries(standardModuleSpecs).filter(
  (entry): entry is [string, StandardModuleRuntimeSpec] =>
    entry[0].endsWith("RuntimeSpec") &&
    typeof entry[1] === "object" &&
    entry[1] !== null &&
    Array.isArray((entry[1] as StandardModuleRuntimeSpec).fields),
);

describe("the record-status widget never proposes an owner on create", () => {
  const originalFetch = global.fetch;
  let captured: Record<string, unknown> | null = null;

  beforeEach(() => {
    captured = null;
    global.fetch = (async (_url: string, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "created-1" }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("covers every standard module spec", () => {
    // Guards the sweep itself: an empty or halved list would make every case
    // below vacuous while still reporting green.
    expect(specs.length).toBeGreaterThanOrEqual(10);
  });

  it.each(specs.map(([name, spec]) => ({ name, spec })))(
    "$name omits the owner from the create body",
    async ({ spec }) => {
      const adapter = createStandardModuleDataAdapter(spec);
      const ownerFields = new Set(
        [spec.ownerField, "ownerId", "createdById"].filter(
          (field): field is string => Boolean(field),
        ),
      );

      await adapter.create(
        {} as Parameters<typeof adapter.create>[0],
        Object.fromEntries(
          [...ownerFields].map((field) => [field, "user-1"]),
        ),
      );

      expect(captured).not.toBeNull();
      for (const field of ownerFields) {
        expect(captured).not.toHaveProperty(field);
      }
    },
  );
});
