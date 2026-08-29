/*
 * A read-only model of the App Router tree on disk.
 *
 * BUG-2004 and BUG-2014 are the same defect twice: a link was emitted to a path
 * that has no page, Next matched it against a sibling `[param]` route with the
 * literal segment as a record id, and the page fetched a record that cannot
 * exist. Nothing caught either of them, because a route is a string and a
 * string type-checks.
 *
 * This module resolves a path the way the App Router does — route groups are
 * transparent, `_private` folders are not routable, `[param]` matches one
 * segment, `[...catchAll]` matches the rest — and reports *how* the final
 * segment was matched, which is the part that matters. It reads the filesystem,
 * so it is a test-time utility: nothing in the running app imports it.
 */
import fs from "node:fs";
import path from "node:path";

export const WEB_APP_DIR = path.resolve(__dirname, "..", "..", "app");

export type AppRouteResolution = {
  /** A `page.tsx` was reached for this path. */
  readonly matched: boolean;
  /** The last path segment was consumed by a `[param]` / `[...param]` folder. */
  readonly finalSegmentDynamic: boolean;
  /** Directory of the matched page, relative to `apps/web/app`. */
  readonly pageDir?: string;
};

const NOT_MATCHED: AppRouteResolution = {
  matched: false,
  finalSegmentDynamic: false,
};

function isRouteGroup(name: string) {
  return name.startsWith("(") && name.endsWith(")");
}

function isPrivateFolder(name: string) {
  return name.startsWith("_") || name.startsWith(".");
}

function isParallelSlot(name: string) {
  return name.startsWith("@");
}

function isDynamic(name: string) {
  return name.startsWith("[") && name.endsWith("]");
}

function isCatchAll(name: string) {
  return name.startsWith("[...") || name.startsWith("[[...");
}

function directoriesIn(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function hasPage(dir: string) {
  return (
    fs.existsSync(path.join(dir, "page.tsx")) ||
    fs.existsSync(path.join(dir, "page.ts")) ||
    fs.existsSync(path.join(dir, "page.jsx")) ||
    fs.existsSync(path.join(dir, "page.js"))
  );
}

/**
 * Every directory reachable from `dir` without consuming a path segment: `dir`
 * itself plus any route group nested inside it, transitively.
 */
function transparentDirs(dir: string): string[] {
  const found = [dir];
  for (const name of directoriesIn(dir)) {
    if (isRouteGroup(name)) {
      found.push(...transparentDirs(path.join(dir, name)));
    }
  }
  return found;
}

function resolveFrom(dir: string, segments: readonly string[]): AppRouteResolution {
  for (const base of transparentDirs(dir)) {
    if (segments.length === 0) {
      if (hasPage(base)) {
        return {
          matched: true,
          finalSegmentDynamic: isDynamic(path.basename(base)),
          pageDir: path.relative(WEB_APP_DIR, base).split(path.sep).join("/"),
        };
      }
      continue;
    }

    const [segment, ...rest] = segments;
    const children = directoriesIn(base).filter(
      (name) => !isPrivateFolder(name) && !isParallelSlot(name),
    );

    /* Static folders win over dynamic ones, exactly as Next resolves them. */
    const staticChild = children.find(
      (name) => !isRouteGroup(name) && !isDynamic(name) && name === segment,
    );
    if (staticChild) {
      const result = resolveFrom(path.join(base, staticChild), rest);
      if (result.matched) return result;
    }

    const dynamicChild = children.find(
      (name) => isDynamic(name) && !isCatchAll(name),
    );
    if (dynamicChild) {
      const result = resolveFrom(path.join(base, dynamicChild), rest);
      if (result.matched) {
        return {
          ...result,
          finalSegmentDynamic:
            rest.length === 0 ? true : result.finalSegmentDynamic,
        };
      }
    }

    const catchAllChild = children.find((name) => isCatchAll(name));
    if (catchAllChild && hasPage(path.join(base, catchAllChild))) {
      return {
        matched: true,
        finalSegmentDynamic: true,
        pageDir: path
          .relative(WEB_APP_DIR, path.join(base, catchAllChild))
          .split(path.sep)
          .join("/"),
      };
    }
  }

  return NOT_MATCHED;
}

/** Resolve an internal path (`/approvals/new`) against `apps/web/app`. */
export function resolveAppRoute(routePath: string): AppRouteResolution {
  const [withoutHash] = routePath.split("#");
  const [withoutQuery] = withoutHash.split("?");
  const segments = withoutQuery.split("/").filter(Boolean);
  return resolveFrom(WEB_APP_DIR, segments);
}
