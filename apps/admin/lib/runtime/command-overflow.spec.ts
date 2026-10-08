import { fitCommands, orderCommands } from "./command-overflow";
import type { RuntimeActionDefinition } from "./platform-runtime.types";

/*
 * More appears only when the bar genuinely cannot hold every command, and the
 * commands that leave are the least important ones. The previous bar showed
 * More whenever the registry had marked any action `overflow`, regardless of
 * how much room there was.
 */
function action(
  key: string,
  extra: Partial<RuntimeActionDefinition> = {},
): RuntimeActionDefinition {
  return {
    key,
    label: key,
    scope: "record",
    ...extra,
  } as RuntimeActionDefinition;
}

const bar = orderCommands([
  action("back"),
  action("new"),
  action("edit"),
  action("save"),
  action("save-close"),
  action("refresh"),
  action("create-agreement"),
  action("convert", { placement: "primary" }),
  action("delete", { placement: "overflow", destructive: true }),
]);
const widths = bar.map(() => 100);
const keys = (list: RuntimeActionDefinition[]) => list.map((a) => a.key);

describe("fitCommands", () => {
  it("draws every command inline, with no More, when they all fit", () => {
    // 9 buttons × 100 + 8 gaps × 4 = 932
    const result = fitCommands(bar, widths, 932, 80, 4);
    expect(result.overflow).toEqual([]);
    expect(keys(result.inline)).toEqual(keys(bar));
  });

  it("keeps a command the registry marked overflow inline when there is room", () => {
    const result = fitCommands(bar, widths, 2000, 80, 4);
    expect(keys(result.inline)).toContain("delete");
  });

  it("moves the lowest-priority commands into More first", () => {
    // Room for 5 buttons plus More: 5×100 + 4×4 + 4 + 80 = 600
    const result = fitCommands(bar, widths, 600, 80, 4);
    // The primary business action outranks New; inline keeps display order.
    expect(keys(result.inline)).toEqual([
      "back",
      "edit",
      "save",
      "save-close",
      "convert",
    ]);
    expect(keys(result.overflow)).toEqual([
      "new",
      "refresh",
      "create-agreement",
      "delete",
    ]);
    const tighter = fitCommands(bar, widths, 400, 80, 4);
    expect(keys(tighter.inline)).toEqual(["back", "edit", "convert"]);
    expect(keys(tighter.overflow)).toContain("delete");
  });

  it("never keeps a lower-priority command inline while a higher one is in More", () => {
    const mixed = [action("back"), action("edit"), action("delete", { destructive: true })];
    // Edit is wide; Delete is narrow. Edit not fitting must not let Delete stay.
    const result = fitCommands(mixed, [100, 300, 40], 260, 60, 4);
    expect(keys(result.inline)).toEqual(["back"]);
    expect(keys(result.overflow)).toEqual(["edit", "delete"]);
  });

  it("restores commands when the bar widens again", () => {
    const narrow = fitCommands(bar, widths, 400, 80, 4);
    const wide = fitCommands(bar, widths, 1200, 80, 4);
    expect(narrow.overflow.length).toBeGreaterThan(0);
    expect(wide.overflow).toEqual([]);
  });

  it("orders registry-overflow commands after the inline ones", () => {
    expect(keys(bar).at(-1)).toBe("delete");
  });
});
