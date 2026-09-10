/*
 * ITEM-0109 — the disabled Check In button on `/attendance` explained itself
 * only in a `title` attribute:
 *
 *   <button disabled title="Check in is unavailable because 2026-08-29 is a
 *   scheduled off day."> Check In </button>
 *
 * `title` is unavailable to touch users, is not reliably announced by screen
 * readers, and needs a hover nobody has a reason to attempt. The fix moved
 * the reason into visible text tied to the button by `aria-describedby`
 * (`module-command-bar.tsx`, `CommandButton`) — `title` stays as well.
 *
 * `apps/web` has no rendering test tooling (see `jest.config.js`), so this
 * pins the two things that are checkable without one:
 *
 *  1. `resolveDynamicDisabledReason` — the pure function `CommandButton` calls
 *     to decide what visible text to show — reads the *reported* reason field
 *     off the record rather than only a generic fallback string, for exactly
 *     the shape the attendance command below produces.
 *  2. The Check In command itself still declares `dynamicDisabled` wired to
 *     `attendanceBlockedReason` — the field `attendance/page.tsx` populates
 *     from the API's `blockedReason` — so a future edit to the command
 *     catalog can't silently drop the reason this test exists to keep
 *     visible.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CommandButton,
  resolveDynamicDisabledReason,
} from "../../app/components/runtime/module-command-bar";
import { attendanceRuntimeSpec } from "./modules/standard-module-specs";
import type { CommandDefinition } from "./command-runtime.types";

function findCheckInCommand(): CommandDefinition {
  const command = attendanceRuntimeSpec.commands?.find(
    (candidate) => candidate.key === "attendance.checkIn",
  );
  if (!command) {
    throw new Error("attendance.checkIn command not found in module specs");
  }
  return command;
}

describe("ITEM-0109 — the Check In command's disabled reason is reportable, not just a fallback string", () => {
  it("declares a reported reason field, not only a fallback", () => {
    const command = findCheckInCommand();
    expect(command.dynamicDisabled?.reasonFieldLogicalName).toBe(
      "attendanceBlockedReason",
    );
    expect(command.dynamicDisabled?.fallbackReason).toEqual(
      expect.stringContaining("not available"),
    );
  });

  it("surfaces the exact reason the record reports, over the generic fallback", () => {
    const command = findCheckInCommand();
    const reason = resolveDynamicDisabledReason(command, {
      attendanceActionState: "blocked",
      attendanceBlockedReason:
        "Check in is unavailable because 2026-08-29 is a scheduled off day.",
    });

    expect(reason).toBe(
      "Check in is unavailable because 2026-08-29 is a scheduled off day.",
    );
  });

  it("falls back to the generic message when the record reports no specific reason", () => {
    const command = findCheckInCommand();
    const reason = resolveDynamicDisabledReason(command, {
      attendanceActionState: "blocked",
    });

    expect(reason).toBe(command.dynamicDisabled?.fallbackReason);
  });

  it("reports nothing when the command is enabled", () => {
    const command = findCheckInCommand();
    const reason = resolveDynamicDisabledReason(command, {
      attendanceActionState: "not-checked-in",
      attendanceBlockedReason: "should be ignored while enabled",
    });

    expect(reason).toBe("");
  });
});

describe("ITEM-0109 — the rendered button states the reason as visible text, not only in title", () => {
  const blockedReason =
    "Check in is unavailable because 2026-08-29 is a scheduled off day.";

  function renderCheckIn(record: Record<string, unknown>) {
    const command = findCheckInCommand();
    return renderToStaticMarkup(
      createElement(CommandButton, {
        command,
        disabled: false,
        loading: false,
        onCommand: () => {},
        record,
        runtime: {} as never,
        selectedRecordIds: [],
        source: "primary",
      }),
    );
  }

  it("prints the exact reported reason as visible page text", () => {
    const markup = renderCheckIn({
      attendanceActionState: "blocked",
      attendanceBlockedReason: blockedReason,
    });

    // Visible, not just present in an attribute a mouse-hover would reveal.
    expect(markup).toContain(`>${blockedReason}<`);
  });

  it("ties the visible reason to the button with aria-describedby", () => {
    const markup = renderCheckIn({
      attendanceActionState: "blocked",
      attendanceBlockedReason: blockedReason,
    });

    const describedByMatch = markup.match(/aria-describedby="([^"]+)"/);
    expect(describedByMatch).not.toBeNull();
    const id = describedByMatch?.[1];
    expect(markup).toContain(`id="${id}"`);
  });

  it("still carries the title attribute — visible text is additive, not a replacement", () => {
    const markup = renderCheckIn({
      attendanceActionState: "blocked",
      attendanceBlockedReason: blockedReason,
    });

    expect(markup).toContain(`title="${blockedReason}"`);
  });

  it("renders no visible reason line, and no aria-describedby, when enabled", () => {
    const markup = renderCheckIn({ attendanceActionState: "not-checked-in" });

    expect(markup).not.toContain("aria-describedby");
    expect(markup).not.toContain(blockedReason);
  });
});
