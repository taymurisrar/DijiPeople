import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeOnly } from "../source-scan";

/*
 * TASK-0037 browser pass. The record command bar ran every command inside a
 * React async transition. React 19 holds all state updates made inside an async
 * transition until the action resolves, and a command with a reason prompt
 * awaits the prompt — whose dialog is itself a state update. The dialog never
 * rendered, the action never resolved, and Suspend, Deactivate, Reject, lead
 * Disqualify and contract stage-back silently did nothing.
 */
describe("the command bar never awaits a prompt inside a transition", () => {
  const bar = codeOnly(
    readFileSync(
      join(__dirname, "../../app/_components/runtime/module-action-bar.tsx"),
      "utf8",
    ),
  );

  it("does not run commands through startTransition", () => {
    expect(bar).not.toMatch(/startTransition\(/);
    expect(bar).not.toMatch(/useTransition/);
  });

  it("still runs the command and tracks it as pending", () => {
    expect(bar).toContain("await onAction(action, context)");
    expect(bar).toContain("busy={pendingKey === action.key}");
  });
});
