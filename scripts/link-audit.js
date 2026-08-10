const fs = require("node:fs");
const path = require("node:path");

/*
 * Finds internal links in an app that no route can serve.
 *
 * The platform dashboard shipped a "Monitoring settings" button pointing at
 * /settings/monitoring, a segment with no page — it returned the admin 404.
 * Nothing catches that: the href is a string, the route tree is a directory
 * layout, and neither knows about the other. This walks both and reports
 * links with no matching route.
 *
 * Static literal hrefs only. A template literal or a variable is skipped and
 * counted, so the report never implies more coverage than it has.
 *
 * Usage: node scripts/link-audit.js apps/admin
 */

const appDir = process.argv[2] || "apps/admin";
const root = path.resolve(appDir);
const appRoot = path.join(root, "app");

if (!fs.existsSync(appRoot)) {
  console.error(`No app directory at ${appRoot}`);
  process.exit(1);
}

/** Every route the App Router can serve, as a matcher. */
function collectRoutes(dir, segments = [], routes = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      /* _private folders hold no routes at all. */
      if (entry.name.startsWith("_")) continue;
      /*
       * (groups) and @slots are absent from the URL. [params] are not — they
       * match a segment, and folding them in here made every dynamic route
       * invisible and every link through one look broken.
       */
      const next = /^[(@]/.test(entry.name)
        ? segments
        : [...segments, entry.name];
      collectRoutes(full, next, routes);
    } else if (/^(page|route)\.(tsx?|jsx?)$/.test(entry.name)) {
      routes.push(segments);
    }
  }
  return routes;
}

const routes = collectRoutes(appRoot).map((segments) => ({
  segments,
  /* [id] matches one segment, [[...slug]] and [...slug] match the rest. */
  test(parts) {
    let i = 0;
    for (const segment of this.segments) {
      if (/^\[\[?\.\.\./.test(segment)) return true;
      if (i >= parts.length) return false;
      if (!/^\[/.test(segment) && segment !== parts[i]) return false;
      i += 1;
    }
    return i === parts.length;
  },
}));

function isServable(href) {
  const parts = href.split("?")[0].split("#")[0].split("/").filter(Boolean);
  return routes.some((route) => route.test(parts));
}

const sourceFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) sourceFiles.push(full);
  }
})(root);

const broken = new Map();
let dynamicSkipped = 0;

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    /* Anything that reads as a route destination, quoted and literal. */
    const matches = line.matchAll(
      /(?:href|redirect\(|push\(|replace\(|to)\s*[=:(]?\s*["'](\/[^"'`]*)["']/g,
    );
    for (const match of matches) {
      const href = match[1];
      if (href.startsWith("/api/")) continue;
      /* Static assets live in public/, not the router. */
      if (/\.[a-z0-9]{2,4}$/i.test(href)) continue;
      if (isServable(href)) continue;
      const key = href.split("?")[0];
      if (!broken.has(key)) broken.set(key, []);
      broken.get(key).push(`${path.relative(root, file)}:${index + 1}`);
    }
    if (/href=\{`\/|redirect\(`\//.test(line)) dynamicSkipped += 1;
  });
}

console.log(`routes discovered: ${routes.length}`);
console.log(`files scanned:     ${sourceFiles.length}`);
console.log(`dynamic hrefs not checked: ${dynamicSkipped}`);
console.log(`\nlinks with no matching route: ${broken.size}`);
for (const [href, sites] of [...broken].sort()) {
  console.log(`\n  ${href}`);
  for (const site of [...new Set(sites)].slice(0, 6)) console.log(`    ${site}`);
}

process.exit(broken.size > 0 ? 1 : 0);
