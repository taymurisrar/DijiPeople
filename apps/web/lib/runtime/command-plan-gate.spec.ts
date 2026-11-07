import { commandsForPlan } from "./command-plan-gate";

const cmd = (key: string) => ({ key }) as never;
const STARTER = ["employees", "leave", "attendance"];

describe("commandsForPlan", () => {
  it("drops Import from a flat list on a plan without data-import-export", () => {
    const out = commandsForPlan([cmd("system.import"), cmd("system.new")], STARTER);
    expect(out.map((c: { key: string }) => c.key)).toEqual(["system.new"]);
  });

  it("drops it from grouped commands and keeps the other groups intact", () => {
    const out = commandsForPlan(
      { primary: [cmd("system.new")], group: [cmd("system.import")] },
      STARTER,
    ) as { primary: unknown[]; group: unknown[] };
    expect(out.primary).toHaveLength(1);
    expect(out.group).toHaveLength(0);
  });

  it("keeps Import when the plan includes data-import-export", () => {
    const list = [cmd("system.import")];
    expect(commandsForPlan(list, [...STARTER, "data-import-export"])).toHaveLength(1);
  });

  it("leaves everything when the plan could not be read", () => {
    const list = [cmd("system.import")];
    expect(commandsForPlan(list, null)).toBe(list);
  });
});
