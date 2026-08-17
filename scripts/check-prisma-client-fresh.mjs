#!/usr/bin/env node
/*
 * Fails fast when the generated Prisma client is older than schema.prisma.
 *
 * Why this exists: `npm run build` regenerates the client and CI runs
 * `npm run prisma:generate` explicitly before typechecking, but `start:dev`
 * did neither. Pulling a branch that adds an enum therefore left the generated
 * client a day behind the schema, and the developer saw 60 TypeScript errors
 * reading "Module '@prisma/client' has no exported member 'LeadInquiryIntent'"
 * plus a runtime crash on `LeadInquiryIntent.REQUEST_DEMO` being undefined —
 * 60 errors all pointing at application code, none of which was wrong. CI was
 * green the whole time, which made the local failure look like a branch defect.
 *
 * Comparing the two schema files byte-for-byte does not work: Prisma writes a
 * reformatted copy into the client directory, so they always differ. Comparing
 * mtimes is fragile across checkouts. What actually matters to a caller is
 * whether every symbol the schema declares is reachable on the client, so that
 * is what this checks — the same question the failure asks.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = join(ROOT, 'services/api/prisma/schema.prisma');

if (!existsSync(SCHEMA)) {
  console.error(`prisma freshness: schema not found at ${SCHEMA}`);
  process.exit(1);
}

const schema = readFileSync(SCHEMA, 'utf8');
const declaredEnums = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);
const declaredModels = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

const require = createRequire(import.meta.url);
let client;
try {
  client = require('@prisma/client');
} catch (error) {
  console.error('prisma freshness: @prisma/client is not installed or not generated.');
  console.error(`  ${error.message}`);
  console.error('\n  Fix: npm run prisma:generate\n');
  process.exit(1);
}

// A model's delegate is camelCase of the model name: MarketCountry -> marketCountry.
const delegate = (model) => model.charAt(0).toLowerCase() + model.slice(1);

const missingEnums = declaredEnums.filter((name) => client[name] === undefined);

/*
 * Reading a delegate off the prototype does not require a live database — the
 * client is only constructed, never connected — but constructing it needs a
 * datasource URL present. When it is absent, checking enums alone still catches
 * the overwhelming majority of drift, so degrade rather than fail the dev boot.
 */
let missingModels = [];
let modelsChecked = false;
if (process.env.DATABASE_URL) {
  try {
    const instance = new client.PrismaClient();
    missingModels = declaredModels.filter((m) => instance[delegate(m)] === undefined);
    modelsChecked = true;
    void instance.$disconnect().catch(() => {});
  } catch {
    // Construction failed for a reason unrelated to freshness; enums still ran.
  }
}

if (missingEnums.length === 0 && missingModels.length === 0) {
  const scope = modelsChecked
    ? `${declaredEnums.length} enums, ${declaredModels.length} models`
    : `${declaredEnums.length} enums`;
  console.log(`prisma freshness: OK — ${scope} reachable on the generated client.`);
  process.exit(0);
}

console.error('\nprisma freshness: THE GENERATED CLIENT IS STALE.\n');
console.error('  schema.prisma declares symbols the generated client does not export.');
console.error('  Your source code is almost certainly fine — the client is out of date.\n');

if (missingEnums.length) {
  console.error(`  Missing enums (${missingEnums.length}):`);
  for (const name of missingEnums.slice(0, 12)) console.error(`    - ${name}`);
  if (missingEnums.length > 12) console.error(`    … and ${missingEnums.length - 12} more`);
}
if (missingModels.length) {
  console.error(`\n  Missing model delegates (${missingModels.length}):`);
  for (const name of missingModels.slice(0, 12)) console.error(`    - prisma.${delegate(name)}`);
  if (missingModels.length > 12) console.error(`    … and ${missingModels.length - 12} more`);
}

console.error('\n  Fix: npm run prisma:generate\n');
process.exit(1);
