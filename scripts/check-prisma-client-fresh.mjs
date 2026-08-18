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
 *
 * BUG-0068 widened "symbol" to include *fields*. (This comment cited BUG-0067
 * until 2026-08-19; that id was never allocated — the record is BUG-0068.)
 * The first version checked
 * enums and model delegates only, which is blind to the most common schema
 * change there is: adding a scalar field to a model that already exists.
 * `ApplicationRelease.checksumSha512` landed on develop, the delegate
 * `prisma.applicationRelease` still resolved, this check printed OK, and the
 * developer got 8 TypeScript errors saying the property does not exist. The
 * guard reported healthy while the exact failure it was written to prevent was
 * happening.
 *
 * Fields come from `Prisma.dmmf`, which is generated data on the client and
 * needs no database and no constructed instance — so the field check runs
 * everywhere, including the dev boot where DATABASE_URL is often absent.
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

/**
 * Field names per model, read from the schema block.
 *
 * Deliberately forgiving: it takes the leading identifier of any line inside a
 * `model` block that is not a comment, a block attribute (`@@index`) or the
 * closing brace. A false negative here silently drops a field from the
 * comparison, so the parse errs toward including a name and letting the DMMF
 * lookup decide.
 */
function declaredFieldsByModel(source) {
  const byModel = new Map();
  const blocks = source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, model, body] of blocks) {
    const fields = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const match = /^(\w+)\s+\S/.exec(line);
      if (match) fields.push(match[1]);
    }
    byModel.set(model, fields);
  }

  return byModel;
}

const declaredFields = declaredFieldsByModel(schema);

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
 * Models and fields both come from the DMMF, which is generated data shipped on
 * the client. It needs no DATABASE_URL and no constructed instance, so unlike
 * the previous delegate probe this runs on every dev boot rather than only when
 * a datasource happens to be configured.
 */
const dmmf = client.Prisma?.dmmf;
let missingModels = [];
let missingFields = [];
let fieldsChecked = false;
let fieldCount = 0;

if (dmmf?.datamodel?.models) {
  const generated = new Map(
    dmmf.datamodel.models.map((model) => [
      model.name,
      new Set(model.fields.map((field) => field.name)),
    ]),
  );

  missingModels = declaredModels.filter((name) => !generated.has(name));

  for (const [model, fields] of declaredFields) {
    const onClient = generated.get(model);
    if (!onClient) continue; // already reported as a missing model
    for (const field of fields) {
      fieldCount += 1;
      if (!onClient.has(field)) missingFields.push(`${model}.${field}`);
    }
  }
  fieldsChecked = true;
} else {
  /*
   * No DMMF means a client old enough that field drift cannot be seen at all.
   * Fall back to the delegate probe so models are still covered.
   */
  try {
    const instance = new client.PrismaClient();
    missingModels = declaredModels.filter((m) => instance[delegate(m)] === undefined);
    void instance.$disconnect().catch(() => {});
  } catch {
    // Construction failed for a reason unrelated to freshness; enums still ran.
  }
}

if (missingEnums.length === 0 && missingModels.length === 0 && missingFields.length === 0) {
  const scope = fieldsChecked
    ? `${declaredEnums.length} enums, ${declaredModels.length} models, ${fieldCount} fields`
    : `${declaredEnums.length} enums, ${declaredModels.length} models`;
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
if (missingFields.length) {
  console.error(`\n  Missing fields (${missingFields.length}):`);
  for (const name of missingFields.slice(0, 12)) console.error(`    - ${name}`);
  if (missingFields.length > 12) console.error(`    … and ${missingFields.length - 12} more`);
}

console.error('\n  Fix: npm run prisma:generate\n');
process.exit(1);
