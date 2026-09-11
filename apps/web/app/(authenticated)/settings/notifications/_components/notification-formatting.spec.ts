import { readFileSync } from "node:fs";
import { join } from "node:path";

import { formatDateTime } from "./notification-ui";
import {
  setDefaultFormattingContext,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";

/**
 * BUG-3316 / REG-412 — why the formatting context must be passed explicitly.
 *
 * `formatDateTime` can read its timezone from a module-level default installed by
 * an effect in `ResolvedSettingsProvider`. Effects do not run during server
 * rendering, so a caller that omits the context gets UTC on the server and the
 * tenant's timezone on the client — two strings for one text node, which is React
 * hydration error #418, and the tree is torn down.
 *
 * Two things are asserted, and the second is the one that actually regresses.
 *
 * The behavioural half proves an explicit context wins over whatever the module
 * default happens to be, which is what makes both renders agree.
 *
 * The wiring half reads the two screens' sources and asserts they pass it. That
 * is deliberately a source assertion rather than a rendered one: the defect is
 * not that formatting is wrong, it is that a call site *omits an argument*, and
 * no amount of rendering with the context passed can observe a caller that does
 * not pass it. Rendering both screens through jsdom to catch a missing argument
 * would be a slower test of a weaker claim.
 */

const COMPONENTS = __dirname;

function source(file: string) {
  return readFileSync(join(COMPONENTS, file), "utf8");
}

describe("formatDateTime honours an explicit context (BUG-3316)", () => {
  afterEach(() => {
    setDefaultFormattingContext(null);
  });

  const INSTANT = "2026-09-11T23:30:00.000Z";

  it("formats in the context it is given, not the module default", () => {
    // The module default says one thing; the explicit context says another.
    // Whichever wins here is what a server render and a client render will
    // disagree about if only one of them has the default installed.
    setDefaultFormattingContext({ timezone: "UTC", locale: "en-US" });

    const explicit: ResolvedFormattingContext = {
      timezone: "Asia/Karachi",
      locale: "en-US",
    };

    const withContext = formatDateTime(INSTANT, explicit);
    const withoutContext = formatDateTime(INSTANT);

    expect(withContext).not.toBe(withoutContext);
  });

  it("is stable across a change to the module default", () => {
    // The heart of it. The same instant and the same explicit context must
    // render identically whether or not the effect has run — that is precisely
    // the difference between a server render and a client one.
    const explicit: ResolvedFormattingContext = {
      timezone: "Asia/Karachi",
      locale: "en-US",
    };

    setDefaultFormattingContext(null);
    const beforeEffect = formatDateTime(INSTANT, explicit);

    setDefaultFormattingContext({ timezone: "UTC", locale: "en-US" });
    const afterEffect = formatDateTime(INSTANT, explicit);

    expect(afterEffect).toBe(beforeEffect);
  });

  it("still reports a missing value rather than an empty cell", () => {
    expect(formatDateTime(null)).toBe("Not set");
    expect(formatDateTime(undefined, { timezone: "UTC" })).toBe("Not set");
  });
});

describe("the notification screens pass the context (REG-412)", () => {
  /*
   * The two screens that carried this defect. Each renders an Updated column,
   * and each must hand `formatDateTime` the value from `useFormattingContext`.
   */
  const SCREENS = [
    "email-providers-manager.tsx",
    "email-templates-table.tsx",
  ] as const;

  it.each(SCREENS)("%s reads the tenant formatting context", (file) => {
    expect(source(file)).toContain("useFormattingContext");
  });

  it.each(SCREENS)("%s passes that context to formatDateTime", (file) => {
    const text = source(file);

    // Every formatDateTime call must carry a second argument. A bare
    // `formatDateTime(x)` is the bug.
    const bareCalls = [...text.matchAll(/formatDateTime\(([^)]*)\)/g)]
      .map((match) => match[1])
      .filter((args) => args.trim() && !args.includes(","));

    expect(bareCalls).toEqual([]);
  });

  it("email-templates-table keeps formatting in its columns memo deps", () => {
    /*
     * The fix without this line is a fix that does nothing: the columns memo
     * closes over `formatting`, so omitting it from the dependency array keeps a
     * renderer bound to the first render's context for ever. Worse than no fix,
     * because it reads as done.
     */
    const text = source("email-templates-table.tsx");
    const deps = /\[busyId, canManage, ([^\]]*)\]/.exec(text)?.[1] ?? "";

    expect(deps).toContain("formatting");
  });
});
