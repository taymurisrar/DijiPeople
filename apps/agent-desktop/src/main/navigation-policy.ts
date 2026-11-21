/*
 * Navigation policy for the agent's own windows.
 *
 * The agent shows three local HTML pages (login, device permissions, location
 * request) through `loadFile`. None of them has a reason to open another
 * window, navigate to another page, or attach a webview. Without an explicit
 * policy Electron allows all three, so a single injected link or `window.open`
 * in a renderer page would put a web page into a window that has the preload
 * bridge (`contextBridge`) attached, on an employee's machine.
 *
 * This is deliberately a pure function with no `electron` import, so it can be
 * unit-tested with ts-jest. The Electron-dependent wiring is in `main.ts`; that
 * wiring cannot be exercised without a real window, and a real-device check is
 * required before a build that contains it is distributed (ITEM-0234).
 */

/**
 * A navigation is allowed only to a local file. Anything else — http(s), data:,
 * javascript:, blob:, custom schemes, or a string that is not a URL — is refused.
 */
export function isAllowedNavigation(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  return parsed.protocol === "file:";
}
