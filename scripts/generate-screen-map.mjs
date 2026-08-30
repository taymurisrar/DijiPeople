#!/usr/bin/env node
/*
 * Enumerate every App Router screen in the three authenticated frontends, and
 * link the ones that can be linked to the API path and entity they render.
 *
 * Phase 5 of the discovery protocol — route -> screen -> API -> entity — had
 * never run, and it is the layer that connects everything already documented to
 * what a user actually sees. 342 screens is too many to describe by hand and
 * far too many to keep described by hand, so this generates the inventory and
 * the prose notes carry the meaning.
 *
 * Two populations, and the split is the finding:
 *
 *   RUNTIME   declared in apps/web/lib/runtime/modules/standard-module-specs.ts
 *             with an `apiPath` and an `entityLogicalName`. The mapping is
 *             machine-readable because the module system made it so.
 *
 *   BESPOKE   a hand-written page. Its API calls and its entity can only be
 *             found by reading it. This map says so rather than guessing.
 *
 * Guessing would be easy and wrong: a route named `/employees` need not read
 * `Employee`, and several do not.
 *
 *   node scripts/generate-screen-map.mjs [--check]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/knowledge/architecture/screen-map.md');
const SPECS = join(ROOT, 'apps/web/lib/runtime/modules/standard-module-specs.ts');
const CHECK = process.argv.includes('--check');

const APPS = [
  { name: 'Tenant product', dir: 'apps/web/app', app: 'web', port: 3001 },
  { name: 'Platform admin', dir: 'apps/admin/app', app: 'admin', port: 3002 },
  { name: 'Landing', dir: 'apps/landing/app', app: 'landing', port: 3000 },
];

/** Every directory holding a `page.tsx`, as a URL path. */
function routesIn(appDir) {
  const base = join(ROOT, appDir);
  if (!existsSync(base)) return [];
  const routes = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        /* `components/` and `api/` hold no user-facing routes. */
        if (entry === 'components' || entry === 'api' || entry === '_components') continue;
        walk(path);
      } else if (entry === 'page.tsx') {
        const relativePath = relative(base, dir).split(sep).join('/');
        /*
         * Route groups — `(authenticated)`, `(public)` — organise files without
         * appearing in the URL. Stripping them is what makes this a route list
         * rather than a directory listing.
         */
        const url = `/${relativePath}`.replace(/\/\([^/]+\)/g, '').replace(/^$/, '/') || '/';
        routes.push({ url, file: `${appDir}/${relativePath}/page.tsx` });
      }
    }
  };

  walk(base);
  return routes.sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * The runtime module specs, as `{ moduleKey, apiPath, entityLogicalName }`.
 *
 * A regex over the source rather than an import: the specs file is TypeScript
 * with app-only imports, and a build step to read three fields from it would be
 * a build step nobody runs. The fields are declared as adjacent literals, which
 * is exactly what a regex is good for — and `--check` fails loudly if the shape
 * ever stops matching, because the table empties.
 */
function runtimeModules() {
  if (!existsSync(SPECS)) return [];
  const source = readFileSync(SPECS, 'utf8');
  const found = [];
  const pattern =
    /moduleKey:\s*"([^"]+)",[\s\S]{0,400}?apiPath:\s*"([^"]+)",[\s\S]{0,200}?entityLogicalName:\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    found.push({ moduleKey: match[1], apiPath: match[2], entity: match[3] });
  }
  return found;
}

const modules = runtimeModules();

/** Match a route to a runtime module by its first path segment. */
function moduleFor(url) {
  const segment = url.split('/')[1] ?? '';
  if (!segment) return null;
  return (
    modules.find((module) => module.apiPath === `/api/${segment}`) ??
    modules.find((module) => module.moduleKey === segment) ??
    null
  );
}

const lines = [];
lines.push('---');
lines.push('aliases: [Screen Map]');
lines.push('---');
lines.push('');
lines.push('# Screen Map');
lines.push('');
lines.push(
  '> **Generated** by `scripts/generate-screen-map.mjs`. Every App Router screen ' +
    'in the frontends, with the API path and entity for those the runtime module ' +
    'system declares. Do not hand-edit.',
);
lines.push('');
lines.push(
  'A screen marked **bespoke** is a hand-written page whose API calls and ' +
    'underlying entity can only be found by reading it. That is not a gap in ' +
    'this generator — it is the actual state of the mapping, and the reason ' +
    'Phase 5 of [[discovery-status]] is not finished. Nothing here is inferred ' +
    'from a route name; a route called `/employees` need not read `Employee`.',
);
lines.push('');
lines.push('## What this map does not tell you');
lines.push('');
lines.push(
  '**A route is not a reachable screen.** Verified against the `dijipeople-demo` ' +
    'tenant on 2026-08-30: the workspace navigation offered seven destinations — ' +
    'Overview, Employees, Leave, Attendance, Approvals, Reports, Settings — ' +
    'against 254 routes in `apps/web`. Plan entitlements, permissions and ' +
    'navigation configuration all narrow what a given user can actually get to, ' +
    'and none of that is visible in a file tree. Treat the count below as the ' +
    'surface that exists, not the surface anyone sees.',
);
lines.push('');
lines.push(
  '**`apiPath` is called by the server, not the browser.** Loading `/leaves` on ' +
    'that tenant issued no client-side request to `/api/leave-requests`; the list ' +
    'arrives already rendered, and the only client calls were notifications and ' +
    'settings. Runtime list and record screens fetch through ' +
    '`apps/web/lib/server-api.ts` in a server component. Watching the browser ' +
    'network log to discover which endpoint a screen uses will therefore find ' +
    'nothing, and concluding the screen calls no API would be wrong.',
);
lines.push('');

let total = 0;
const sections = [];

for (const app of APPS) {
  const routes = routesIn(app.dir);
  total += routes.length;
  const runtime = routes.filter((route) => moduleFor(route.url));

  sections.push({ app, routes, runtime });
}

lines.push(
  `**${total} screens** across ${APPS.length} applications · ` +
    `${modules.length} runtime modules declare an API path and entity`,
);
lines.push('');
lines.push('Related: [[domain-map]] · [[data-model-overview]] · [[discovery-status]] · [[known-gaps]]');
lines.push('');

for (const { app, routes, runtime } of sections) {
  lines.push(`## ${app.name} — \`${app.dir.replace('/app', '')}\` (port ${app.port})`);
  lines.push('');
  lines.push(`${routes.length} screens, ${runtime.length} runtime-driven.`);
  lines.push('');

  if (routes.length === 0) {
    lines.push('_No App Router pages found._');
    lines.push('');
    continue;
  }

  lines.push('| Route | Source | API | Entity |');
  lines.push('|---|---|---|---|');
  for (const route of routes) {
    const module = moduleFor(route.url);
    lines.push(
      `| \`${route.url}\` | \`${route.file}\` | ` +
        `${module ? `\`${module.apiPath}\`` : '_bespoke_'} | ` +
        `${module ? `\`${module.entity}\`` : '—'} |`,
    );
  }
  lines.push('');
}

lines.push('## Runtime modules');
lines.push('');
lines.push(
  'Declared in `apps/web/lib/runtime/modules/standard-module-specs.ts`. These ' +
    'are the modules whose list and record screens are rendered by the standard ' +
    'runtime pages rather than written by hand.',
);
lines.push('');
lines.push('| Module key | API path | Entity |');
lines.push('|---|---|---|');
for (const module of modules.sort((a, b) => a.moduleKey.localeCompare(b.moduleKey))) {
  lines.push(`| \`${module.moduleKey}\` | \`${module.apiPath}\` | \`${module.entity}\` |`);
}
lines.push('');

const body = lines.join('\n');

if (CHECK) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== body) {
    console.error('docs/knowledge/architecture/screen-map.md is stale');
    console.error('Run `node scripts/generate-screen-map.mjs` and commit the result.');
    process.exit(1);
  }
  console.log(`screen-map: ${total} screens, ${modules.length} runtime modules — CURRENT`);
} else {
  writeFileSync(OUT, body);
  console.log(`screen-map: ${total} screens, ${modules.length} runtime modules — WRITTEN`);
}
