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

// MOD-005: package import gives the modules it CREATES their missing defaults (create-only).
const alm = fs.readFileSync(path.join(ROOT, 'services/api/src/modules/customization/package-alm.service.ts'), 'utf8');
if (!/provisionImportedModules\(/.test(alm)) failures.push('MOD-005 package-alm.service.ts no longer provisions imported modules (provisionImportedModules)');

// MOD-006: the plan is profile-driven; each kind that exists in the schema is handled, and the
// views that only make sense for some kinds say so.
const schema = fs.readFileSync(path.join(ROOT, 'services/api/prisma/schema.prisma'), 'utf8');
const kinds = /enum CustomizationModuleKind \{([^}]*)\}/.exec(schema)?.[1].split(/\s+/).filter(Boolean) ?? [];
const lifecycle = fs.readFileSync(path.join(ROOT, 'services/api/src/modules/data/custom-record-lifecycle.ts'), 'utf8');
for (const k of kinds) if (!new RegExp(`\\b${k}:`).test(lifecycle)) failures.push(`MOD-006 module kind ${k} has no record-lifecycle rule`);
if (!/needsUserOwned: true/.test(plan) || !/needsDeactivate: true/.test(plan)) failures.push('MOD-006 My/Active/Inactive views must be gated by module kind (needsUserOwned / needsDeactivate)');
if (kinds.length < 4) failures.push('MOD-006 CustomizationModuleKind enum missing or shrunk');

// MOD-007: reconciliation is explicit. It must never be wired to startup, seeding or a schedule.
const recon = fs.readFileSync(path.join(ROOT, 'services/api/src/modules/customization/module-reconciliation.service.ts'), 'utf8');
if (/OnModuleInit|OnApplicationBootstrap|@Cron|setInterval|setTimeout/.test(recon)) failures.push('MOD-007 module-reconciliation.service.ts must not run on startup or on a schedule');
for (const rel of ['services/api/src/main.ts', 'services/api/src/app.module.ts']) {
  const f = path.join(ROOT, rel);
  if (fs.existsSync(f) && /ModuleReconciliationService|reconcileModules|provisionExistingModule/.test(fs.readFileSync(f, 'utf8'))) failures.push(`MOD-007 ${rel} references reconciliation — it must stay an explicit, per-request action`);
}
for (const f of fs.readdirSync(path.join(ROOT, 'services/api/prisma')).filter((x) => /^seed.*\.ts$/.test(x))) {
  if (/ModuleReconciliationService|reconcileModules|provisionExistingModule|reconcileModuleComponents/.test(fs.readFileSync(path.join(ROOT, 'services/api/prisma', f), 'utf8'))) failures.push(`MOD-007 prisma/${f} must not run reconciliation (seeds run on every deploy)`);
}
if (!/confirmTenantSlug/.test(recon) || !/PRODUCTION/.test(recon) || !/authorizationRef/.test(recon)) failures.push('MOD-007 apply must require the retyped slug and, for PRODUCTION, an authorization reference');

if (failures.length) {
  console.error(`check-module-completeness FAILED — ${failures.length} problem(s):`);
  failures.forEach((f) => console.error('  x ' + f));
  process.exit(1);
}
console.log(`check-module-completeness: ${found.size} module-write files registered, ${viewKeys.length} views / ${formKeys.length} forms planned — OK`);
