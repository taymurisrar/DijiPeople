import { settingsAdapterRegistry } from "../../app/(authenticated)/settings/_lib/settings-adapter-registry";
import { relatedRecordPaths } from "./related-record-api";
import { createStandardModuleDataAdapter } from "./modules/standard-module-data.adapter";
import {
  approvalRuntimeSpec,
  attendanceRuntimeSpec,
  customerRuntimeSpec,
  jobOpeningRuntimeSpec,
  leaveRuntimeSpec,
  onboardingRuntimeSpec,
  projectRuntimeSpec,
  recruitmentApplicationRuntimeSpec,
  recruitmentCandidateRuntimeSpec,
  recruitmentTalentPoolRuntimeSpec,
  timesheetRuntimeSpec,
} from "./modules/standard-module-specs";

/*
 * BUG-2011 — a related record must end up attached to the parent it was created
 * from, and there is exactly one way that can fail.
 *
 * The "New" dialog on a related list is opened from a parent record and offers
 * no field for the foreign key, because the user is not being asked which
 * parent they meant — they already said. So the runtime supplies it, in one of
 * two places: the create **path**, when the template names `{parentId}`, or the
 * request **body**, keyed by the subgrid's target field.
 *
 * The defect was that the adapter chose between them by asking whether the
 * subgrid declared an `api` block at all — a different question with a
 * different answer. Seven subgrids declared one with a flat create path and so
 * got neither. Six failed with a 400 naming a field the dialog has no control
 * for. The seventh, Department > Teams, returned 201 and created a team with
 * `departmentId = null` — invisible, because a team with no department never
 * appears in a department's list.
 *
 * That last one is why this file exists rather than a fixed guard being deemed
 * enough. A subgrid can be broken in a way that returns success, so it cannot
 * be relied on to announce itself; it has to be checked by construction.
 *
 * There was no test anywhere in `apps/web` exercising related-record creation
 * when this was found.
 */

type RelatedTab = {
  readonly relationshipName: string;
  readonly relatedEntityLogicalName?: string;
  readonly targetFieldLogicalName?: string;
  readonly listPath?: string;
  readonly createPath?: string;
};

type Declared = {
  /** Where a human should go to fix it. */
  readonly origin: string;
  readonly tab: RelatedTab;
};

const STANDARD_SPECS = [
  approvalRuntimeSpec,
  attendanceRuntimeSpec,
  customerRuntimeSpec,
  jobOpeningRuntimeSpec,
  leaveRuntimeSpec,
  onboardingRuntimeSpec,
  projectRuntimeSpec,
  recruitmentApplicationRuntimeSpec,
  recruitmentCandidateRuntimeSpec,
  recruitmentTalentPoolRuntimeSpec,
  timesheetRuntimeSpec,
];

function declaredTabs(): Declared[] {
  const found: Declared[] = [];

  for (const spec of STANDARD_SPECS) {
    for (const tab of spec.relatedTabs ?? []) {
      found.push({
        origin: `standard-module-specs.ts > ${spec.moduleKey} > ${tab.relationshipName}`,
        tab,
      });
    }
  }

  /*
   * The settings registry is the half that mattered: six of the seven broken
   * subgrids live here, and none of them are in `SPECS`. A spec that walked
   * only the standard modules would have reported the class fixed while most
   * instances of it were still broken.
   */
  for (const [key, adapter] of settingsAdapterRegistry) {
    // A settings adapter wraps its runtime spec under `.spec`, one level
    // deeper than a standard module spec carries it.
    const tabs = (adapter as { spec?: { relatedTabs?: readonly RelatedTab[] } })
      .spec?.relatedTabs;
    for (const tab of tabs ?? []) {
      found.push({
        origin: `settings-adapter-registry.ts > ${key} > ${tab.relationshipName}`,
        tab,
      });
    }
  }

  return found;
}

const TABS = declaredTabs();

describe("BUG-2011 — a related-list create carries its parent id", () => {
  it("finds related tabs to check at all", () => {
    /*
     * Guards the guard. If either registry is refactored so `relatedTabs` moves
     * or is renamed, every `it.each` below silently runs zero times and this
     * file goes green while asserting nothing — the exact failure mode of a
     * `describe.each` over an empty array.
     */
    expect(TABS.length).toBeGreaterThan(20);
    expect(
      TABS.some((entry) => entry.origin.startsWith("settings-adapter-registry")),
    ).toBe(true);
    expect(
      TABS.some((entry) => entry.origin.startsWith("standard-module-specs")),
    ).toBe(true);
  });

  it.each(TABS.map((entry) => [entry.origin, entry] as const))(
    "%s can supply the parent id",
    (_origin, entry) => {
      const consumedInPath = (entry.tab.createPath ?? "").includes("{parentId}");
      /*
       * One or the other, and it does not matter which. A path naming
       * `{parentId}` needs no body key; a flat path needs the target field, so
       * the adapter has something to key the injected value by. A subgrid with
       * neither cannot attach the record to anything, and no adapter fix
       * reaches it — it is a declaration bug.
       *
       * Weak on its own, and deliberately kept anyway: `targetFieldLogicalName`
       * is currently required by `StandardModuleRelatedTabSpec`, so today this
       * cannot fail. It is here for the day that type is relaxed or a subgrid
       * is declared through a looser path, and the behavioural tests below are
       * what actually pin the fix. Recorded rather than dressed up, because a
       * test that cannot fail is worth nothing if a reader believes it can.
       */
      expect(consumedInPath || Boolean(entry.tab.targetFieldLogicalName)).toBe(
        true,
      );
    },
  );
});

describe("BUG-2011 — the create request carries the parent id", () => {
  /*
   * The tests that would have failed before the fix, and the reason the guard
   * is not left at the declaration level: Department > Teams returned 201 while
   * being wrong, so only the request body itself settles it.
   */
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "created-1" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  async function createVia(createPath: string) {
    const adapter = createStandardModuleDataAdapter({
      moduleKey: "department",
      basePath: "/api/departments",
    } as never);

    await adapter.createRelatedRecord?.({
      parentRecordId: "dept-1",
      parentLookupField: "departmentId",
      values: { name: "Platform" },
      subgrid: {
        relationshipName: "teams",
        entityLogicalName: "department",
        relatedEntityLogicalName: "team",
        api: { listPath: createPath, createPath },
      },
    } as never);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return {
      path: (fetchMock.mock.calls[0] as [string])[0],
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    };
  }

  it("puts the parent id in the body when the path does not take it", async () => {
    const { path, body } = await createVia("/api/teams");
    expect(path).toBe("/api/teams");
    /*
     * The whole defect in one assertion. Before the fix this body was
     * `{ name: "Platform" }`, the POST returned 201, and the team was created
     * with `departmentId = null` — never appearing in the parent list it was
     * created from.
     */
    expect(body.departmentId).toBe("dept-1");
    expect(body.name).toBe("Platform");
  });

  it("does not duplicate it into the body when the path already took it", async () => {
    const { path, body } = await createVia("/api/departments/{parentId}/teams");
    expect(path).toBe("/api/departments/dept-1/teams");
    // Not merely absent-or-correct: absent. The endpoint reads it from the path,
    // and a body key it does not declare is a 400 under `forbidNonWhitelisted`.
    expect(body).not.toHaveProperty("departmentId");
  });
});

describe("BUG-2011 — relatedRecordPaths reports whether the path took the id", () => {
  function pathsFor(createPath?: string) {
    return relatedRecordPaths({
      parentRecordId: "parent-1",
      parentLookupField: "departmentId",
      subgrid: {
        relationshipName: "teams",
        entityLogicalName: "department",
        relatedEntityLogicalName: "team",
        api: createPath
          ? { listPath: createPath, createPath }
          : undefined,
      },
    } as never);
  }

  it("reports false for a flat create path, so the adapter supplies the body key", () => {
    const paths = pathsFor("/api/teams");
    expect(paths.createConsumedParentId).toBe(false);
    expect(paths.create).toBe("/api/teams");
  });

  it("reports true when the template names the parent id", () => {
    const paths = pathsFor("/api/departments/{parentId}/teams");
    expect(paths.createConsumedParentId).toBe(true);
    expect(paths.create).toBe("/api/departments/parent-1/teams");
  });

  it("reports false for an unconfigured subgrid, which posts to the generic endpoint", () => {
    /*
     * The pre-fix guard was `!input.subgrid.api`, so this case — no `api` block
     * at all — was the one it got right. It must keep working: the generic
     * `/api/data` fallback carries the parent as a query parameter for the
     * *list*, and still needs the key in the body on create.
     */
    const paths = pathsFor(undefined);
    expect(paths.createConsumedParentId).toBe(false);
    expect(paths.create).toContain("/api/data/team");
  });
});
