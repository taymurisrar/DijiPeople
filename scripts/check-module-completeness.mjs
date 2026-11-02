#!/usr/bin/env node
// Module completeness gate (policy MOD-001..MOD-003).
//
// Static, DB-free. It proves that module creation goes through the one
// provisioner; the behavioural proof (rollback, idempotency, customisation
// preservation, tenant isolation) is
// services/api/src/modules/customization/module-provisioning.behaviour.spec.ts.
// A live tenant's actual modules are checked by calling
// CustomizationService.reconcileModuleComponents, which is a no-op when complete.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/engineering/module-creation-entrypoints.json'), 'utf8'));
const failures = [];
const WRITE_RE = /customizationTable\.(create|createMany|upsert)\(/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name) && !/\.e2e-spec\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

// MOD-001: every write site is a registered entrypoint, with the declared count.
const found = new Map();
for (const dir of ['services/api/src', 'services/api/prisma']) {
  for (const f of walk(path.join(ROOT, dir))) {
    const n = (fs.readFileSync(f, 'utf8').match(WRITE_RE) ?? []).length;
    if (n) found.set(path.relative(ROOT, f).replace(/\\/g, '/'), n);
  }
}
const declared = new Map(reg.entrypoints.map((e) => [e.file, e]));
for (const [file, n] of found) {
  const d = declared.get(file);
  if (!d) failures.push(`MOD-001 ${file}: ${n} CustomizationTable write(s) in an unregistered module-creation path — route it through CustomizationService.createTable or register it with a reason`);
  else if (d.writes !== n) failures.push(`MOD-001 ${file}: ${n} write site(s) found, ${d.writes} registered — a new write site needs a reviewed reason in module-creation-entrypoints.json`);
}
for (const file of declared.keys()) if (!found.has(file)) failures.push(`MOD-001 ${file}: registered but no longer writes CustomizationTable — remove the entry`);

// MOD-002: the custom-module path uses the provisioner transactionally.
const svc = fs.readFileSync(path.join(ROOT, reg.provisioner.consumer), 'utf8');
for (const pat of reg.provisioner.requiredConsumerPatterns) {
  if (!svc.includes(pat)) failures.push(`MOD-002 ${reg.provisioner.consumer}: missing "${pat}" — createTable must provision transactionally and expose reconcile`);
}
const create = /async createTable\([\s\S]*?\n {2}\}\n/.exec(svc.replace(/\r\n/g, '\n'));
if (!create) failures.push('MOD-002 createTable not found');
else if (!/\$transaction\(/.test(create[0]) || !/provisionModuleComponents\(/.test(create[0]))
  failures.push('MOD-002 createTable must call provisionModuleComponents inside this.prisma.$transaction');

// MOD-003: the plan is well-formed (single default, unique keys, no phantom filters).
const plan = fs.readFileSync(path.join(ROOT, reg.provisioner.file), 'utf8');
const viewKeys = [...plan.matchAll(/viewKey: '([^']+)'/g)].map((m) => m[1]);
const formKeys = [...plan.matchAll(/formKey: '([^']+)'/g)].map((m) => m[1]);
if (new Set(viewKeys).size !== viewKeys.length) failures.push('MOD-003 duplicate planned view keys');
if (new Set(formKeys).size !== formKeys.length) failures.push('MOD-003 duplicate planned form keys');
if (!viewKeys.length || !formKeys.length) failures.push('MOD-003 plan declares no views or no forms');

if (failures.length) {
  console.error(`check-module-completeness FAILED — ${failures.length} problem(s):`);
  failures.forEach((f) => console.error('  x ' + f));
  process.exit(1);
}
console.log(`check-module-completeness: ${found.size} module-write files registered, ${viewKeys.length} views / ${formKeys.length} forms planned — OK`);
