#!/usr/bin/env node
// Count-based claims in the instruction files are DERIVED, not typed (policy DOC-001).
//
//   node scripts/derive-doc-facts.mjs           print the facts
//   node scripts/derive-doc-facts.mjs --write   update every <!--fact:key-->…<!--/fact--> in AGENTS.md
//   node scripts/derive-doc-facts.mjs --check   fail if any marked number is stale (CI / preflight)
//
// Why: AGENTS.md is the highest-authority instruction file and carried
// hand-typed counts that drifted (it said 312 models / 210 migrations / 33 public
// handlers while the tree had 340 / 235 / 45). An agent that "re-derives a number
// rather than trusting it" is correct but should not have to; the number can be
// a marker the tooling keeps true. Only counts that a script can compute belong
// behind a marker; judgement stays prose.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanApi } from './lib/api-routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['AGENTS.md'];

export function deriveFacts(root = ROOT) {
  const controllers = scanApi(root);
  const routes = controllers.flatMap((c) => c.routes);
  const schema = fs.readFileSync(path.join(root, 'services/api/prisma/schema.prisma'), 'utf8');
  const migrationsDir = path.join(root, 'services/api/prisma/migrations');
  const publicRoutes = routes.filter((r) => r.public);
  return {
    modules: fs.readdirSync(path.join(root, 'services/api/src/modules'), { withFileTypes: true }).filter((e) => e.isDirectory()).length,
    controllers: controllers.length,
    routes: routes.length,
    publicHandlers: publicRoutes.length,
    publicControllers: new Set(publicRoutes.map((r) => r.file)).size,
    prismaModels: (schema.match(/^model \w+/gm) ?? []).length,
    prismaEnums: (schema.match(/^enum \w+/gm) ?? []).length,
    schemaLines: schema.split(/\r?\n/).length - (schema.endsWith('\n') ? 1 : 0),
    migrations: fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length,
  };
}

const MARKER = /<!--fact:(\w+)-->([^<]*)<!--\/fact-->/g;
const fmt = (n) => (n >= 1000 ? n.toLocaleString('en-US') : String(n));

export function applyFacts(text, facts) {
  const unknown = [];
  const out = text.replace(MARKER, (m, key, current) => {
    if (!(key in facts)) {
      unknown.push(key);
      return m;
    }
    return `<!--fact:${key}-->${fmt(facts[key])}<!--/fact-->`;
  });
  return { out, unknown };
}

export function staleFacts(text, facts) {
  const stale = [];
  for (const m of text.matchAll(MARKER)) {
    const [, key, current] = m;
    if (!(key in facts)) stale.push(`${key}: unknown fact`);
    else if (current !== fmt(facts[key])) stale.push(`${key}: file says ${current}, tree has ${fmt(facts[key])}`);
  }
  return stale;
}

function main() {
  const argv = process.argv.slice(2);
  const facts = deriveFacts();
  if (!argv.includes('--write') && !argv.includes('--check')) {
    console.log(JSON.stringify(facts, null, 2));
    return;
  }
  let problems = 0;
  for (const rel of TARGETS) {
    const file = path.join(ROOT, rel);
    const text = fs.readFileSync(file, 'utf8');
    if (argv.includes('--write')) {
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      const { out, unknown } = applyFacts(text.replace(/\r\n/g, '\n'), facts);
      if (unknown.length) {
        console.error(`${rel}: unknown fact key(s): ${unknown.join(', ')}`);
        problems++;
      }
      fs.writeFileSync(file, eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out);
      console.log(`${rel}: facts updated`);
    } else {
      const stale = staleFacts(text, facts);
      if (stale.length) {
        console.error(`${rel} has stale derived facts — run node scripts/derive-doc-facts.mjs --write:\n  ${stale.join('\n  ')}`);
        problems++;
      } else console.log(`${rel}: derived facts current (${[...text.matchAll(MARKER)].length} marked)`);
    }
  }
  process.exit(problems ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
