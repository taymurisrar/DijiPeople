import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-1883 — App releases and Agent rollout rendered on a shell nothing else in
 * the console used.
 *
 * Both were hand-rolled pages with their own `<main>` and Tailwind `dark:`
 * variants. The admin app has no dark mode to switch them on, so on a light
 * product they appeared as dark navy panels with headings floating outside the
 * standard page header — visibly a different application, on the screen an
 * operator uses to ship a desktop-agent release to every tenant.
 *
 * What this pins is not "the styling looks right", which no test can say, but
 * the three structural facts the fix depends on: the screen is on the shared
 * shell, nothing on it targets a theme that does not exist, and the old URLs
 * still resolve.
 */

const APP = join(__dirname, "../app");

function read(...segments: string[]) {
  return readFileSync(join(APP, ...segments), "utf8").replace(/\r\n/g, "\n");
}

function codeOnly(source: string) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("BUG-1883 — the desktop agent is one settings screen", () => {
  const page = read("(internal)", "settings", "desktop-agent", "page.tsx");
  const manager = read("_components", "settings", "desktop-agent-manager.tsx");

  it("is on the shared settings shell, like every other settings screen", () => {
    expect(page).toContain("SettingsShell");
    expect(page).toContain("DesktopAgentManager");
    // Not its own page frame. That was the defect.
    expect(codeOnly(page)).not.toContain("<main");
  });

  it("targets no theme the admin app does not have", () => {
    /*
     * The load-bearing assertion. `dark:` variants are inert here — nothing
     * sets a dark theme — so they are not merely unused, they are why the
     * empty state rendered as a dark panel in a light product.
     */
    expect(codeOnly(manager)).not.toMatch(/\bdark:/);
    expect(codeOnly(page)).not.toMatch(/\bdark:/);
  });

  it("keeps both halves of one decision on one screen", () => {
    // Releases decide what exists on a channel; rollout decides who receives
    // that channel. They were a click apart, and that is how they got confused.
    expect(manager).toContain('key: "releases"');
    expect(manager).toContain('key: "rollout"');
    expect(manager).toContain('role="tablist"');
  });

  it("still answers on the old URLs rather than 404", () => {
    // They are in bookmarks and in the release runbook; a move should not read
    // as a deletion.
    for (const route of ["app-releases", "agent-rollout"]) {
      const source = codeOnly(read("(internal)", route, "page.tsx"));
      expect([route, source.includes('redirect("/settings/desktop-agent")')]).toEqual([
        route,
        true,
      ]);
    }
  });

  it("is reachable from Settings and no longer from Operations", () => {
    const sidebar = codeOnly(read("_components", "admin-sidebar.tsx"));
    expect(sidebar).not.toContain('href: "/app-releases"');
    expect(sidebar).not.toContain('href: "/agent-rollout"');

    const settingsIndex = read("(internal)", "settings", "page.tsx");
    expect(settingsIndex).toContain('href: "/settings/desktop-agent"');
  });
});
