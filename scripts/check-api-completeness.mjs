#!/usr/bin/env node
// API completeness gate (policy API-001..API-005, docs/engineering/standards/api-resource-lifecycle.md).
//
//   node scripts/check-api-completeness.mjs              verify (CI / preflight)
//   node scripts/check-api-completeness.mjs --inventory  also write the inventory report
//   node scripts/check-api-completeness.mjs --init       (re)seed the baseline from the current tree
//
// A route that merely exists is not "working": this proves only that every
// controller is CLASSIFIED, that declared lifecycle operations are DECLARED,
// that forbidden destructive verbs are absent, and that routes carry guards.
// Behaviour is proven by the resource's own specs and the e2e suites.
//
// Ratchet: today's gaps live in `baseline` so they stay visible without
// blocking unrelated work; a NEW gap is not in the baseline and fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanApi } from './lib/api-routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'docs/engineering/api-resource-contracts.json');
const INVENTORY = path.join(ROOT, 'docs/engineering/api-completeness-inventory.md');
const TYPES = ['standard-mutable', 'read-only', 'action', 'sensitive'];
const LIFECYCLE = ['create', 'get', 'list', 'update', 'delete'];
const MUTATING = ['create', 'update', 'delete', 'restore', 'bulk', 'import'];

const args = new Set(process.argv.slice(2));
const controllers = scanApi(ROOT);
const key = (r) => `${r.file}#${r.method} ${r.path}`;

function opsOf(c) {
  const s = new Set();
  for (const r of c.routes) s.add(r.op);
  return s;
}

function suggestType(c) {
  const ops = opsOf(c);
  if (LIFECYCLE.filter((o) => ops.has(o)).length >= 3 && ops.has('create') && ops.has('update')) return 'standard-mutable';
  const mutates = MUTATING.some((o) => ops.has(o));
  if (!mutates && c.routes.every((r) => r.method === 'GET')) return 'read-only';
  return 'action';
}

function load() {
  if (!fs.existsSync(MANIFEST)) return { version: 1, resources: [], baseline: {} };
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function missingOps(c, res) {
  const ops = opsOf(c);
  return (res.requires ?? []).filter((o) => !ops.has(o) && !(res.notApplicable ?? {})[o]);
}

if (args.has('--init')) {
  const m = load();
  const classified = new Map(m.resources.map((r) => [r.controller, r]));
  for (const c of controllers) {
    if (!classified.has(c.file) && !m.resources.some((r) => r.controller === c.file)) {
      const type = suggestType(c);
      m.resources.push({
        controller: c.file,
        type,
        requires: type === 'standard-mutable' ? LIFECYCLE : [],
        notApplicable: {},
        classifiedBy: 'init-heuristic (review me)',
      });
    }
  }
  const byFile = new Map(controllers.map((c) => [c.file, c]));
  m.baseline = {
    note: 'Ratchet: gaps that existed when the gate was introduced. Entries may only be REMOVED; a new gap fails the gate.',
    missingRequiredOps: Object.fromEntries(
      m.resources
        .filter((r) => byFile.has(r.controller))
        .map((r) => [r.controller, missingOps(byFile.get(r.controller), r)])
        .filter(([, v]) => v.length),
    ),
    routesWithoutDeclaredPermission: controllers
      .flatMap((c) => c.routes)
      .filter((r) => !r.public && !r.legacyPermission && !r.matrixPermission && !r.platformPermission)
      .map(key)
      .sort(),
    forbiddenVerbExceptions: [],
  };
  m.resources.sort((a, b) => a.controller.localeCompare(b.controller));
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  console.log(`seeded ${m.resources.length} resources; baseline: ${Object.keys(m.baseline.missingRequiredOps).length} controllers with missing ops, ${m.baseline.routesWithoutDeclaredPermission.length} routes without a declared permission`);
  process.exit(0);
}

const manifest = load();
const failures = [];
const byFile = new Map(controllers.map((c) => [c.file, c]));
const declared = new Map(manifest.resources.map((r) => [r.controller, r]));
const base = manifest.baseline ?? {};

// API-001: every controller is classified.
for (const c of controllers) {
  if (!declared.has(c.file)) failures.push(`API-001 ${c.file}: controller is not classified in api-resource-contracts.json (type: ${TYPES.join('|')})`);
}
for (const r of manifest.resources) {
  if (!byFile.has(r.controller)) failures.push(`API-001 ${r.controller}: manifest entry has no controller (renamed or deleted — update the manifest)`);
  else if (!TYPES.includes(r.type)) failures.push(`API-001 ${r.controller}: unknown type "${r.type}"`);
}

for (const r of manifest.resources) {
  const c = byFile.get(r.controller);
  if (!c) continue;
  const ops = opsOf(c);
  // API-002: declared lifecycle operations exist unless justified or baselined.
  const baselined = new Set(base.missingRequiredOps?.[r.controller] ?? []);
  for (const o of missingOps(c, r)) {
    if (!baselined.has(o)) failures.push(`API-002 ${r.controller}: standard resource lacks "${o}" and declares no notApplicable reason`);
  }
  for (const [o, why] of Object.entries(r.notApplicable ?? {})) {
    if (!why || String(why).trim().length < 10) failures.push(`API-002 ${r.controller}: notApplicable.${o} needs a real justification`);
  }
  // API-003: read-only / sensitive resources must not grow mutating verbs.
  if (r.type === 'read-only' || r.type === 'sensitive') {
    const allow = new Set([...(r.allow ?? []), ...(base.forbiddenVerbExceptions ?? []).filter((e) => e.startsWith(r.controller + '#')).map((e) => e.split('#')[1])]);
    for (const route of c.routes) {
      const destructive = ['delete', 'update', 'restore', 'bulk'].includes(route.op);
      if (destructive && !allow.has(`${route.method} ${route.path}`) && r.type === 'read-only')
        failures.push(`API-003 ${key(route)}: ${route.op} on a read-only resource (add to "allow" with an ADR-backed reason)`);
      if (r.type === 'sensitive' && route.op === 'delete' && !allow.has(`${route.method} ${route.path}`))
        failures.push(`API-003 ${key(route)}: DELETE on a sensitive resource requires an explicit "allow" entry`);
    }
  }
  void ops;
}

// API-004: every non-public route is guarded. No baseline — zero today.
for (const c of controllers)
  for (const r of c.routes) if (!r.public && !r.guarded) failures.push(`API-004 ${key(r)}: route has no @UseGuards and is not @Public()`);

// API-005: every non-public route declares a permission (ratcheted).
const permBaseline = new Set(base.routesWithoutDeclaredPermission ?? []);
const stale = [];
for (const c of controllers)
  for (const r of c.routes)
    if (!r.public && !r.legacyPermission && !r.matrixPermission && !r.platformPermission && !permBaseline.has(key(r)))
      failures.push(`API-005 ${key(r)}: no @Permissions/@RequirePermission/@RequirePlatformPermission declared`);
const live = new Set(controllers.flatMap((c) => c.routes).map(key));
for (const k of permBaseline) if (!live.has(k)) stale.push(k);

if (args.has('--inventory')) {
  const all = controllers.flatMap((c) => c.routes);
  const lines = [
    '# API completeness inventory',
    '',
    '> GENERATED by `node scripts/check-api-completeness.mjs --inventory`. Do not edit.',
    '> Static analysis of controller decorators: it proves what is *declared*, not that it works.',
    '',
    `Controllers: **${controllers.length}** · routes: **${all.length}** · public: **${all.filter((r) => r.public).length}** · routes without a visibly declared permission (baseline): **${permBaseline.size}**`,
    '',
    '## Standard mutable resources — lifecycle coverage',
    '',
    '| Controller | create | get | list | update | delete | Gap status |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of manifest.resources.filter((x) => x.type === 'standard-mutable')) {
    const c = byFile.get(r.controller);
    if (!c) continue;
    const ops = opsOf(c);
    const cell = (o) => (ops.has(o) ? 'yes' : (r.notApplicable ?? {})[o] ? 'n/a' : 'GAP');
    const gaps = missingOps(c, r);
    lines.push(`| ${r.controller.split('/').slice(-1)[0].replace('.controller.ts', '')} | ${LIFECYCLE.map(cell).join(' | ')} | ${gaps.length ? 'UNREVIEWED gap: ' + gaps.join(', ') : 'complete'} |`);
  }
  lines.push('', '`GAP` = operation absent with no `notApplicable` justification. It is **unreviewed**, not necessarily wrong: a gap is only fixed by implementing the operation, or recorded as intentionally prohibited with a reason. Never add an endpoint just to turn a cell green.', '');
  const tally = {};
  manifest.resources.forEach((r) => (tally[r.type] = (tally[r.type] ?? 0) + 1));
  lines.push('## Classification', '', Object.entries(tally).map(([t, n]) => `- ${t}: ${n}`).join('\n'), '');
  fs.writeFileSync(INVENTORY, lines.join('\n'));
}

if (stale.length) console.log(`note: ${stale.length} baseline permission entries no longer match a route — prune them (ratchet may only shrink)`);
if (failures.length) {
  console.error(`check-api-completeness FAILED — ${failures.length} problem(s):`);
  for (const f of failures.slice(0, 60)) console.error('  x ' + f);
  if (failures.length > 60) console.error(`  … and ${failures.length - 60} more`);
  process.exit(1);
}
console.log(`check-api-completeness: ${controllers.length} controllers classified, ${controllers.flatMap((c) => c.routes).length} routes checked — OK`);
