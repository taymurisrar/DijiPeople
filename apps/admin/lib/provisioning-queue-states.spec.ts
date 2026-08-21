import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const api = readFileSync(
  join(
    REPO_ROOT,
    "services/api/src/modules/tenant-control-plane/provisioning-operations.service.ts",
  ),
  "utf8",
);
const queue = readFileSync(
  join(
    __dirname,
    "..",
    "app",
    "(internal)",
    "operations",
    "provisioning",
    "provisioning-queue.tsx",
  ),
  "utf8",
);

/** The union body, from `export type ProvisioningOperationalState = …;`. */
function statesIn(source: string) {
  const start = source.indexOf("ProvisioningOperationalState =");
  if (start === -1) throw new Error("No ProvisioningOperationalState found");
  const body = source.slice(start, source.indexOf(";", start));
  return new Set(
    [...body.matchAll(/'([A-Z_]+)'|"([A-Z_]+)"/g)].map(
      (match) => match[1] ?? match[2],
    ),
  );
}

/**
 * Two copies of one union, across a workspace boundary.
 *
 * `ProvisioningOperationalState` is declared on the API and declared again in
 * the admin queue, because there is no shared types package and creating one
 * needs an ADR. So the duplication is a deliberate, recorded compromise — and
 * this is what stops it becoming a defect.
 *
 * It already did. The API gained `STALLED`, the queue did not, and
 * `STATE_LABEL[row.operationalState]` returned `undefined`: an **empty state
 * cell** in a table whose only job is telling six states apart. Nothing in the
 * admin workspace failed. It was caught by a signed-in accessibility journey
 * asserting that state is never carried by colour alone — a browser test, three
 * layers away, on a run that takes minutes.
 *
 * This runs in under a second and names the missing state.
 */
describe("provisioning queue states", () => {
  const apiStates = statesIn(api);
  const queueStates = statesIn(queue);

  it("reads a non-trivial union from both sides", () => {
    // A parser that silently matched nothing would make every check below pass.
    expect(apiStates.size).toBeGreaterThan(4);
    expect(queueStates.size).toBe(apiStates.size);
  });

  it("renders every state the API can emit", () => {
    const missing = [...apiStates].filter((state) => !queueStates.has(state));
    expect(missing).toEqual([]);
  });

  it("declares no state the API cannot emit", () => {
    // The other direction matters too: a label for a state that never arrives
    // is dead code that reads as coverage.
    const extra = [...queueStates].filter((state) => !apiStates.has(state));
    expect(extra).toEqual([]);
  });

  it("gives every state a label, a colour and a sort position", () => {
    /*
     * `Record<State, string>` already forces the first two at compile time —
     * but only once the union itself is updated, which is the step that was
     * missed. Asserting the literals means the union and the maps have to move
     * together.
     */
    for (const state of apiStates) {
      expect(queue).toContain(`${state}:`);
      expect(queue).toContain(`"${state}"`);
    }
  });

  it("never lets an unknown state render as an empty cell", () => {
    /*
     * The fallback is the reason this defect can only ever be ugly again, not
     * invisible. A state column that renders nothing is worse than one that
     * renders a constant name.
     */
    expect(queue).toContain("STATE_LABEL[row.operationalState] ??");
    expect(queue).toContain("STATE_CLASS[row.operationalState] ??");
  });
});
