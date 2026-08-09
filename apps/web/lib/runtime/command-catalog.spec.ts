import {
  COMMAND_CATALOG,
  COMMAND_PLACEMENTS,
  commandsForPlacement,
  findCommand,
} from "./command-catalog";

/*
 * The catalog is what stops an administrator saving a command key the runtime
 * cannot resolve. A button configured against a bad key renders and does
 * nothing, which is worse than a button that never appeared — so the catalog
 * has to stay honest about which keys exist and where they belong.
 */

describe("COMMAND_CATALOG", () => {
  it("has a unique key per entry", () => {
    const keys = COMMAND_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses namespaced keys the runtime resolves", () => {
    for (const entry of COMMAND_CATALOG) {
      expect(entry.key).toMatch(/^(system|record|selection)\.[a-zA-Z]+$/);
    }
  });

  it("gives every command at least one placement", () => {
    for (const entry of COMMAND_CATALOG) {
      expect(entry.placements.length).toBeGreaterThan(0);
    }
  });

  it("only cites placements that exist", () => {
    const known = new Set(COMMAND_PLACEMENTS.map((entry) => entry.key));
    for (const entry of COMMAND_CATALOG) {
      for (const placement of entry.placements) {
        expect(known.has(placement)).toBe(true);
      }
    }
  });

  it("gives every command a label and an icon so the designer never renders blank", () => {
    for (const entry of COMMAND_CATALOG) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.icon.trim()).not.toBe("");
      expect(entry.description.trim()).not.toBe("");
    }
  });
});

describe("commandsForPlacement", () => {
  it("offers save on a record toolbar but not on a list toolbar", () => {
    const listKeys = commandsForPlacement("list-command-bar").map((e) => e.key);
    const recordKeys = commandsForPlacement("detail-command-bar").map(
      (e) => e.key,
    );

    expect(recordKeys).toContain("system.save");
    expect(listKeys).not.toContain("system.save");
  });

  it("offers the bulk commands only on the bulk menu", () => {
    const bulk = commandsForPlacement("bulk-menu").map((e) => e.key);
    expect(bulk).toContain("selection.delete");

    const list = commandsForPlacement("list-command-bar").map((e) => e.key);
    expect(list).not.toContain("selection.delete");
  });

  it("returns the whole catalog when no placement is chosen yet", () => {
    expect(commandsForPlacement(undefined)).toHaveLength(COMMAND_CATALOG.length);
  });

  it("leaves no placement without any command to offer", () => {
    for (const placement of COMMAND_PLACEMENTS) {
      expect(commandsForPlacement(placement.key).length).toBeGreaterThan(0);
    }
  });
});

describe("findCommand", () => {
  it("resolves a known key and returns nothing for an unknown one", () => {
    expect(findCommand("system.new")?.label).toBe("New");
    expect(findCommand("system.doesNotExist")).toBeUndefined();
  });
});

describe("COMMAND_PLACEMENTS", () => {
  it("describes where each bar appears, in words an administrator can act on", () => {
    for (const placement of COMMAND_PLACEMENTS) {
      expect(placement.label.trim()).not.toBe("");
      /* "Scope: recordRead" was the problem; a real sentence is the fix. */
      expect(placement.description.length).toBeGreaterThan(20);
    }
  });
});
