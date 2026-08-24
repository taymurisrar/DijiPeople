import { DlpRuleEvaluator } from "./rule-evaluator";
import type { DlpRuleConfig } from "../types";

const EXCEL_TO_WHATSAPP: DlpRuleConfig = {
  id: "rule-1",
  name: "Payroll to WhatsApp",
  enabled: true,
  sourceAppPatterns: ["excel", "payroll"],
  channelAppPatterns: ["whatsapp", "telegram"],
  action: "OBSERVE",
};

function evaluator(
  rules: DlpRuleConfig[] = [EXCEL_TO_WHATSAPP],
  windowSeconds = 30,
): DlpRuleEvaluator {
  const e = new DlpRuleEvaluator();
  e.configure(rules, windowSeconds);
  return e;
}

describe("DlpRuleEvaluator", () => {
  it("fires once when a copy from a source app is followed by a channel app", () => {
    const e = evaluator();

    e.noteClipboardCopy({ name: "Excel", path: "C:/Office/EXCEL.EXE" }, 1_000);
    const first = e.evaluateForeground(
      { name: "WhatsApp", path: "C:/WhatsApp/WhatsApp.exe" },
      2_000,
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      ruleId: "rule-1",
      sourceApp: "Excel",
      channelApp: "WhatsApp",
      action: "OBSERVE",
    });

    // The armed copy is consumed: focusing WhatsApp again does not re-fire.
    const second = e.evaluateForeground(
      { name: "WhatsApp", path: null },
      3_000,
    );
    expect(second).toHaveLength(0);
  });

  it("does not fire when the copy did not come from a source app", () => {
    const e = evaluator();

    e.noteClipboardCopy(
      { name: "Notepad", path: "C:/Windows/notepad.exe" },
      1_000,
    );
    expect(e.armedCount()).toBe(0);

    const triggers = e.evaluateForeground(
      { name: "WhatsApp", path: null },
      2_000,
    );
    expect(triggers).toHaveLength(0);
  });

  it("does not fire when the foreground is not a channel app", () => {
    const e = evaluator();

    e.noteClipboardCopy({ name: "Excel", path: null }, 1_000);
    const triggers = e.evaluateForeground(
      { name: "Outlook", path: null },
      2_000,
    );

    expect(triggers).toHaveLength(0);
    // Still armed — a later switch to WhatsApp within the window should fire.
    expect(e.armedCount()).toBe(1);
  });

  it("expires an armed copy after the trigger window", () => {
    const e = evaluator([EXCEL_TO_WHATSAPP], 30);

    e.noteClipboardCopy({ name: "Excel", path: null }, 1_000);
    const triggers = e.evaluateForeground(
      { name: "WhatsApp", path: null },
      40_000,
    );

    expect(triggers).toHaveLength(0);
    expect(e.armedCount()).toBe(0);
  });

  it("ignores disabled rules", () => {
    const e = evaluator([{ ...EXCEL_TO_WHATSAPP, enabled: false }]);

    e.noteClipboardCopy({ name: "Excel", path: null }, 1_000);
    expect(e.armedCount()).toBe(0);
  });

  it("matches on the app path when the name is missing", () => {
    const e = evaluator();

    e.noteClipboardCopy(
      { name: null, path: "C:/Program Files/Microsoft Office/EXCEL.EXE" },
      1_000,
    );
    const triggers = e.evaluateForeground(
      { name: null, path: "C:/Users/x/AppData/WhatsApp/WhatsApp.exe" },
      2_000,
    );

    expect(triggers).toHaveLength(1);
    expect(triggers[0].sourceApp).toContain("EXCEL.EXE");
  });

  it("drops armed copies for a rule removed by reconfigure", () => {
    const e = evaluator();

    e.noteClipboardCopy({ name: "Excel", path: null }, 1_000);
    expect(e.armedCount()).toBe(1);

    e.configure([], 30);
    expect(e.armedCount()).toBe(0);

    const triggers = e.evaluateForeground(
      { name: "WhatsApp", path: null },
      2_000,
    );
    expect(triggers).toHaveLength(0);
  });
});
