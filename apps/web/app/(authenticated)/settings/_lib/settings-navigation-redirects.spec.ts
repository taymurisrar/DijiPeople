import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/*
 * DP-QA-023. Every settings navigation link is prefetched. When the link's
 * href is itself a redirect (a next.config `redirects()` entry, or a page whose
 * only job is `redirect(...)`), the prefetch is a redirected RSC fetch, which
 * WebKit rejects as an "access control check" failure and surfaces as an
 * uncaught page error on whatever page is open. Navigation must therefore point
 * at the FINAL destination; the redirects stay in place for old bookmarks.
 *
 * Source-level on purpose (web jest has no DOM, and the failure only shows in
 * WebKit). No newline literals are matched, so CRLF checkouts behave the same.
 */
const WEB_ROOT = join(__dirname, "..", "..", "..", "..");

function redirectSources(): Set<string> {
  const config = readFileSync(join(WEB_ROOT, "next.config.ts"), "utf8");
  const sources = new Set<string>();
  for (const match of config.matchAll(
    /\[\s*"(\/[^"]+)"\s*,\s*"(\/[^"]+)"\s*\]/g,
  )) {
    sources.add(match[1]);
  }
  return sources;
}

function redirectOnlyPages(): Set<string> {
  const appRoot = join(WEB_ROOT, "app");
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name === "page.tsx") {
        const source = readFileSync(full, "utf8");
        if (source.length < 900 && /redirect\(\s*["`]\//.test(source)) {
          const route = relative(appRoot, join(full, ".."))
            .split(sep)
            .filter((part) => !/^\(.*\)$/.test(part))
            .join("/");
          found.add(`/${route}`);
        }
      }
    }
  };
  walk(appRoot);
  return found;
}

describe("settings navigation points at final destinations", () => {
  it("has no navigation href that is a redirect", () => {
    const redirecting = new Set([...redirectSources(), ...redirectOnlyPages()]);
    const navigation = readFileSync(
      join(__dirname, "settings-navigation.ts"),
      "utf8",
    );
    const hrefs = [...navigation.matchAll(/href:\s*"(\/[^"?]+)/g)].map(
      (match) => match[1],
    );

    expect(hrefs.length).toBeGreaterThan(50);
    expect(hrefs.filter((href) => redirecting.has(href))).toEqual([]);
  });
});
