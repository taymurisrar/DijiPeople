#!/usr/bin/env node
/**
 * Object-storage reconciliation / orphan report.
 *
 * REPORT ONLY. This script never writes, deletes or repairs anything — there
 * is no `--fix` mode and none is planned here. That is a deliberate product
 * decision, not a missing feature: the live Render service never had a
 * persistent disk, so every row whose `storageProvider` is NULL predates
 * object storage and its bytes are already gone (they lived on the ephemeral
 * container filesystem). A cleanup pass needs a grace period and independent
 * verification before it deletes anything, and that is out of scope for this
 * change. This script's job is to say, with evidence, what state every row is
 * actually in.
 *
 * ## The four measured buckets
 *
 *   DURABLE               storageProvider is set and the object exists in the
 *                          configured store.
 *   MISSING_IN_STORE       storageProvider is set but the object is absent —
 *                          a real orphan: the row believes it has bytes and
 *                          does not.
 *   LEGACY_UNRECOVERABLE   storageProvider is NULL. The row predates object
 *                          storage; its bytes were written to the ephemeral
 *                          disk and cannot be recovered (see the migration
 *                          note on 20260910121838_add_object_storage_metadata).
 *   NO_KEY                 the row has no storage key at all — nothing to
 *                          reconcile.
 *
 * A fifth, non-requested bucket exists purely for honesty:
 *
 *   UNVERIFIED             storageProvider is set but this run could not check
 *                           existence — no store is configured, the row's
 *                           provider does not match the one currently
 *                           configured (so checking the wrong store would
 *                           misreport it), or the store returned something
 *                           other than "found" / "not found" (a transient
 *                           outage, a permissions error). Never folded into
 *                           DURABLE or MISSING_IN_STORE: a count this script
 *                           could not measure is reported as unmeasured, not
 *                           guessed.
 *
 * ## The 15 models
 *
 * Document, DocumentVersion, DocumentReference, EmployeeDocumentReference,
 * SupportCaseAttachment, ContractDocument, ContractTemplateVersion,
 * ContractVersion, SignatureEvidence, Invoice, ScreenCaptureEvent, DataJob
 * (three key columns: sourceFileKey / resultFileKey / errorFileKey, one
 * shared storageProvider column), ReportRun and ApplicationRelease each carry
 * an independent storage-key column, verified against
 * `services/api/prisma/schema.prisma` at the time this script was written.
 *
 * TenantBranding does NOT carry an independent storage key. Its
 * logoUrl/faviconUrl/loginImageUrl columns hold a *view path*
 * (`/api/documents/{id}/view`) written by
 * `TenantSettingsService.syncTenantBrandingModel`, which points at an
 * ordinary `Document` row created through `BrandingAssetsService`. Those
 * bytes are already reconciled by the Document pass; TenantBranding is
 * reported separately, as a cross-reference, and is NOT added to the grand
 * total — doing so would double-count the same object.
 *
 * ## Reverse direction (bucket -> database)
 *
 * Objects that exist in the store with no database row pointing at them are
 * detected by listing the bucket/prefix and diffing against every storage key
 * this script found. Listing a large production bucket is expensive and, past
 * some size, impractical to hold in memory — so this direction is OFF by
 * default and only runs with `--check-bucket`. `--max-list` bounds how many
 * keys are read; a truncated listing is reported as truncated, never silently
 * treated as complete.
 *
 * ## Works with STORAGE_PROVIDER=local
 *
 * Existence is checked against whatever `resolveStorageConfig` (the same
 * function `StorageModule` uses at boot) resolves from the environment. With
 * `STORAGE_PROVIDER=local` this checks the local filesystem and needs no R2
 * credentials at all, so the script can be exercised in development.
 *
 * Usage:
 *   node scripts/storage-reconcile.mjs
 *   node scripts/storage-reconcile.mjs --json
 *   node scripts/storage-reconcile.mjs --check-bucket
 *   node scripts/storage-reconcile.mjs --check-bucket --bucket-prefix tenants/<id> --max-list 20000
 *   node scripts/storage-reconcile.mjs --concurrency 4
 *
 * Credentials come from the environment, never from a flag:
 *   DATABASE_URL, STORAGE_PROVIDER, R2_* (see docs/environment-variables.md)
 *
 * Exit codes:
 *   0  nothing needing attention (no MISSING_IN_STORE rows, no bucket orphans)
 *   1  at least one MISSING_IN_STORE row or bucket orphan was found
 *   2  could not run (no DATABASE_URL, could not connect, a query failed)
 */

import { readFileSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `
storage-reconcile — read-only object-storage reconciliation report

Usage:
  node scripts/storage-reconcile.mjs [options]

Options:
  --json                 Print the full report as JSON instead of a table.
  --check-bucket         Also list the configured store and report objects
                          with no matching database row (opt-in: expensive on
                          a large bucket).
  --bucket-prefix <p>    Restrict --check-bucket's listing to this key prefix
                          (e.g. "tenants/<tenantId>"). Default: whole store.
  --max-list <n>         Stop listing after this many objects (default 100000).
                          A truncated listing is reported as truncated.
  --concurrency <n>      Parallel existence checks against the store
                          (default 16).
  --sample <n>           Fetch at most <n> rows per model. For a quick spot
                          check only — omit for a real reconciliation, because
                          a sampled run cannot report MEASURED totals.
  -h, --help             Show this help and exit.

This script never modifies anything. There is no --fix mode. See the file
header for the classification rules and why deletion is out of scope.
`.trim();

function parseArgs(argv) {
  const args = {
    json: false,
    checkBucket: false,
    bucketPrefix: '',
    maxList: 100_000,
    concurrency: 16,
    sample: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        args.json = true;
        break;
      case '--check-bucket':
        args.checkBucket = true;
        break;
      case '--bucket-prefix':
        args.bucketPrefix = argv[++i] ?? '';
        break;
      case '--max-list':
        args.maxList = Number(argv[++i]);
        break;
      case '--concurrency':
        args.concurrency = Number(argv[++i]);
        break;
      case '--sample':
        args.sample = Number(argv[++i]);
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        console.error(`storage-reconcile: unknown option "${arg}"\n`);
        console.error(HELP);
        process.exit(2);
    }
  }
  return args;
}

const ARGS = parseArgs(process.argv.slice(2));

if (ARGS.help) {
  console.log(HELP);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load the real config-resolution and key-normalisation logic from the API
// rather than re-implementing it. Both source files import only types besides
// Node builtins, so transpiling either one alone (no build step required) runs
// the exact rules `StorageModule` and the local provider apply in production.
// Prefers a real build when one exists, exactly like
// scripts/backfill-incident-classification.mjs.
// ---------------------------------------------------------------------------

async function loadTsModule(distRelParts, srcRelParts) {
  const distSpecifier = './' + path.posix.join(...distRelParts);
  try {
    return await import(distSpecifier);
  } catch {
    // Falls through to transpiling the single file below.
  }

  const { default: ts } = await import('typescript');
  const source = readFileSync(path.join(REPO_ROOT, ...srcRelParts), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
}

async function loadStorageConfig() {
  return loadTsModule(
    ['..', 'services', 'api', 'dist', 'src', 'common', 'storage', 'storage.config.js'],
    ['services', 'api', 'src', 'common', 'storage', 'storage.config.ts'],
  );
}

async function loadStorageKeys() {
  return loadTsModule(
    ['..', 'services', 'api', 'dist', 'src', 'common', 'storage', 'storage-keys.js'],
    ['services', 'api', 'src', 'common', 'storage', 'storage-keys.ts'],
  );
}

// ---------------------------------------------------------------------------
// Existence checking, one implementation per provider. Mirrors
// services/api/src/common/storage/providers/{r2,local}-object-storage.provider.ts
// closely enough to trust, without depending on Nest DI to construct one.
// ---------------------------------------------------------------------------

function isNotFoundError(error) {
  if (!error || typeof error !== 'object') return false;
  const name = error.name;
  if (name === 'NoSuchKey' || name === 'NotFound') return true;
  const status = error.$metadata?.httpStatusCode;
  return status === 404;
}

function makeR2Checker(config) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    maxAttempts: config.maxAttempts,
    requestHandler: {
      requestTimeout: config.requestTimeoutMs,
      connectionTimeout: Math.min(config.requestTimeoutMs, 5_000),
    },
  });

  return {
    provider: 'r2',
    async exists(key) {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return { state: 'exists' };
      } catch (error) {
        if (isNotFoundError(error)) return { state: 'absent' };
        return {
          state: 'unreachable',
          reason: error instanceof Error ? error.name : 'unknown error',
        };
      }
    },
    async listKeys(prefix, maxList) {
      const keys = [];
      let truncated = false;
      let continuationToken;
      try {
        do {
          const response = await client.send(
            new ListObjectsV2Command({
              Bucket: config.bucket,
              Prefix: prefix || undefined,
              ContinuationToken: continuationToken,
              MaxKeys: 1000,
            }),
          );
          for (const object of response.Contents ?? []) {
            if (object.Key) keys.push(object.Key);
            if (keys.length >= maxList) {
              truncated = true;
              break;
            }
          }
          continuationToken = truncated
            ? undefined
            : response.NextContinuationToken;
        } while (continuationToken);
      } catch (error) {
        return {
          keys,
          truncated,
          error: error instanceof Error ? error.message : 'unknown error',
        };
      }
      return { keys, truncated, error: null };
    },
  };
}

function makeLocalChecker(config, normalizeKey) {
  const root = path.resolve(process.cwd(), config.root);

  function resolvePath(key) {
    const normalized = normalizeKey(key);
    if (normalized === null) return null;
    const absolute = path.resolve(path.join(root, normalized));
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      return null;
    }
    return absolute;
  }

  return {
    provider: 'local',
    async exists(key) {
      const absolute = resolvePath(key);
      if (absolute === null) return { state: 'absent' };
      try {
        await fsp.stat(absolute);
        return { state: 'exists' };
      } catch {
        return { state: 'absent' };
      }
    },
    async listKeys(prefix, maxList) {
      const keys = [];
      let truncated = false;

      async function walk(dir, relParts) {
        if (truncated) return;
        let entries;
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (truncated) return;
          const relParts2 = [...relParts, entry.name];
          if (entry.isDirectory()) {
            // eslint-disable-next-line no-await-in-loop
            await walk(path.join(dir, entry.name), relParts2);
          } else if (entry.isFile()) {
            const key = relParts2.join('/');
            if (!prefix || key.startsWith(prefix)) {
              keys.push(key);
              if (keys.length >= maxList) {
                truncated = true;
                return;
              }
            }
          }
        }
      }

      await walk(root, []);
      return { keys, truncated, error: null };
    },
  };
}

// ---------------------------------------------------------------------------
// Concurrency-limited mapper. No new dependency for something this small.
// ---------------------------------------------------------------------------

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane);
  await Promise.all(lanes);
  return results;
}

// ---------------------------------------------------------------------------
// The 15 models. `keyFields` lists every storage-key column a model carries;
// DataJob is the one model with more than one, sharing a single
// `providerField`. `tenantField` is null where the model carries no direct
// tenantId (e.g. ContractDocument, reached only through its Contract).
// ---------------------------------------------------------------------------

const MODEL_SPECS = [
  { model: 'Document', prop: 'document', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: 'tenantId' },
  { model: 'DocumentVersion', prop: 'documentVersion', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: 'tenantId' },
  { model: 'DocumentReference', prop: 'documentReference', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: 'tenantId' },
  { model: 'EmployeeDocumentReference', prop: 'employeeDocumentReference', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: 'tenantId' },
  { model: 'SupportCaseAttachment', prop: 'supportCaseAttachment', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: null },
  { model: 'ContractDocument', prop: 'contractDocument', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: null },
  { model: 'ContractTemplateVersion', prop: 'contractTemplateVersion', keyFields: ['sourceStorageKey'], providerField: 'sourceStorageProvider', tenantField: null },
  { model: 'ContractVersion', prop: 'contractVersion', keyFields: ['sourceStorageKey'], providerField: 'sourceStorageProvider', tenantField: null },
  { model: 'SignatureEvidence', prop: 'signatureEvidence', keyFields: ['signatureStorageKey'], providerField: 'signatureStorageProvider', tenantField: null },
  { model: 'Invoice', prop: 'invoice', keyFields: ['pdfStorageKey'], providerField: 'pdfStorageProvider', tenantField: 'tenantId' },
  { model: 'ScreenCaptureEvent', prop: 'screenCaptureEvent', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: 'tenantId' },
  { model: 'DataJob', prop: 'dataJob', keyFields: ['sourceFileKey', 'resultFileKey', 'errorFileKey'], providerField: 'storageProvider', tenantField: 'tenantId' },
  { model: 'ReportRun', prop: 'reportRun', keyFields: ['resultFileKey'], providerField: 'storageProvider', tenantField: 'tenantId' },
  { model: 'ApplicationRelease', prop: 'applicationRelease', keyFields: ['storageKey'], providerField: 'storageProvider', tenantField: null },
];

const BUCKETS = ['DURABLE', 'MISSING_IN_STORE', 'LEGACY_UNRECOVERABLE', 'NO_KEY', 'UNVERIFIED'];

function emptyCounts() {
  return Object.fromEntries(BUCKETS.map((b) => [b, 0]));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      'storage-reconcile: DATABASE_URL is not set. This script queries every ' +
        'model with a storage key and needs a database connection.',
    );
    return 2;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const { resolveStorageConfig, describeStorageConfig } = await loadStorageConfig();
  const { normalizeKey } = await loadStorageKeys();

  const resolution = resolveStorageConfig(process.env);
  for (const warning of resolution.warnings) {
    console.error(`storage-reconcile: warning — ${warning}`);
  }

  let checker = null;
  if (resolution.config) {
    console.error(`storage-reconcile: ${describeStorageConfig(resolution.config)}`);
    checker =
      resolution.config.provider === 'r2'
        ? makeR2Checker(resolution.config)
        : makeLocalChecker(resolution.config, normalizeKey);
  } else {
    console.error(
      'storage-reconcile: no storage backend could be resolved from the ' +
        `environment (${resolution.errors.join(' ')}). Every row with a ` +
        'storage key and a provider will be reported UNVERIFIED — the ' +
        'database-only buckets (NO_KEY, LEGACY_UNRECOVERABLE) are still measured.',
    );
  }

  // Per-model, per-bucket counts.
  const modelCounts = new Map(MODEL_SPECS.map((s) => [s.model, emptyCounts()]));
  // Every MISSING_IN_STORE row — the actionable, real orphans.
  const missingRows = [];
  // Every UNVERIFIED row, with why.
  const unverifiedRows = [];
  // Keys this run confirmed belong to the currently configured provider,
  // used for the reverse (bucket -> database) direction.
  const knownKeys = new Set();

  // Pending existence checks, deferred so they can run with bounded
  // concurrency instead of one at a time.
  const pending = [];

  // Final bucket per Document id, filled in as each row is classified below.
  // TenantBranding has no storage key of its own (see the header comment) and
  // is reconciled by resolving its view-path columns to a Document id and
  // looking it up here — never by re-querying Document a second time.
  const documentBucketById = new Map();

  for (const spec of MODEL_SPECS) {
    const select = { id: true, [spec.providerField]: true };
    for (const field of spec.keyFields) select[field] = true;
    if (spec.tenantField) select[spec.tenantField] = true;
    select.createdAt = true;

    let rows;
    try {
      rows = await prisma[spec.prop].findMany({
        select,
        ...(ARGS.sample ? { take: ARGS.sample } : {}),
      });
    } catch (error) {
      console.error(
        `storage-reconcile: could not query ${spec.model}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await prisma.$disconnect();
      return 2;
    }

    const counts = modelCounts.get(spec.model);

    for (const row of rows) {
      const provider = row[spec.providerField] ?? null;
      const tenantId = spec.tenantField ? row[spec.tenantField] : null;

      for (const field of spec.keyFields) {
        const key = row[field] ?? null;

        const isDocument = spec.model === 'Document';

        if (!key) {
          counts.NO_KEY += 1;
          if (isDocument) documentBucketById.set(row.id, 'NO_KEY');
          continue;
        }

        if (!provider) {
          counts.LEGACY_UNRECOVERABLE += 1;
          if (isDocument) documentBucketById.set(row.id, 'LEGACY_UNRECOVERABLE');
          continue;
        }

        if (!checker) {
          counts.UNVERIFIED += 1;
          if (isDocument) documentBucketById.set(row.id, 'UNVERIFIED');
          unverifiedRows.push({
            model: spec.model,
            field,
            id: row.id,
            tenantId,
            storageKey: key,
            reason: 'storage backend not configured in this environment',
          });
          continue;
        }

        if (provider !== checker.provider) {
          counts.UNVERIFIED += 1;
          if (isDocument) documentBucketById.set(row.id, 'UNVERIFIED');
          unverifiedRows.push({
            model: spec.model,
            field,
            id: row.id,
            tenantId,
            storageKey: key,
            reason: `row provider "${provider}" does not match the configured provider "${checker.provider}"`,
          });
          continue;
        }

        knownKeys.add(key);
        pending.push({
          model: spec.model,
          field,
          id: row.id,
          tenantId,
          storageKey: key,
          createdAt: row.createdAt,
          counts,
          isDocument,
        });
      }
    }
  }

  if (pending.length > 0 && checker) {
    await mapWithConcurrency(pending, ARGS.concurrency, async (item) => {
      const result = await checker.exists(item.storageKey);
      if (result.state === 'exists') {
        item.counts.DURABLE += 1;
        if (item.isDocument) documentBucketById.set(item.id, 'DURABLE');
      } else if (result.state === 'absent') {
        item.counts.MISSING_IN_STORE += 1;
        if (item.isDocument) documentBucketById.set(item.id, 'MISSING_IN_STORE');
        missingRows.push({
          model: item.model,
          field: item.field,
          id: item.id,
          tenantId: item.tenantId,
          storageKey: item.storageKey,
          createdAt: item.createdAt,
        });
      } else {
        item.counts.UNVERIFIED += 1;
        if (item.isDocument) documentBucketById.set(item.id, 'UNVERIFIED');
        unverifiedRows.push({
          model: item.model,
          field: item.field,
          id: item.id,
          tenantId: item.tenantId,
          storageKey: item.storageKey,
          reason: `store unreachable: ${result.reason ?? 'unknown error'}`,
        });
      }
    });
  }

  // ---------------------------------------------------------------------
  // TenantBranding — no independent storage key. Resolved via its Document.
  // ---------------------------------------------------------------------

  const documentSpec = MODEL_SPECS.find((s) => s.model === 'Document');
  let brandingReport = null;
  if (documentSpec) {
    let brandingRows;
    try {
      brandingRows = await prisma.tenantBranding.findMany({
        select: { id: true, tenantId: true, logoUrl: true, faviconUrl: true, loginImageUrl: true },
      });
    } catch (error) {
      console.error(
        `storage-reconcile: could not query TenantBranding: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await prisma.$disconnect();
      return 2;
    }

    // `documentBucketById` was filled in during the main pass above as each
    // Document row was classified — no second query needed.
    const viewPathPattern = /^\/api\/documents\/([^/]+)\/(?:view|download)$/;
    const assetFields = ['logoUrl', 'faviconUrl', 'loginImageUrl'];
    const crossReference = emptyCounts();
    let danglingReferences = 0;
    let noReference = 0;
    let totalAssets = 0;

    for (const branding of brandingRows) {
      for (const field of assetFields) {
        const value = branding[field];
        if (!value) continue;
        totalAssets += 1;
        const match = viewPathPattern.exec(value);
        if (!match) {
          // Not the standard Document view path — a raw/legacy URL this
          // report cannot resolve to a storage key.
          noReference += 1;
          continue;
        }
        const documentId = match[1];
        const bucket = documentBucketById.get(documentId);
        if (!bucket) {
          danglingReferences += 1;
          continue;
        }
        crossReference[bucket] += 1;
      }
    }

    brandingReport = {
      tenantBrandingRows: brandingRows.length,
      assetReferences: totalAssets,
      crossReference,
      danglingReferences,
      noDocumentReference: noReference,
      note:
        'TenantBranding holds a view path to a Document, not a storage key. ' +
        'These counts are a cross-reference into the Document buckets above ' +
        'and are NOT added to the grand total.',
    };
  }

  // ---------------------------------------------------------------------
  // Reverse direction: objects in the store with no matching database row.
  // ---------------------------------------------------------------------

  let reverseReport = null;
  if (ARGS.checkBucket) {
    if (!checker) {
      reverseReport = {
        ran: false,
        reason: 'storage backend not configured in this environment',
      };
    } else {
      const listing = await checker.listKeys(ARGS.bucketPrefix, ARGS.maxList);
      const orphanKeys = listing.keys.filter((key) => !knownKeys.has(key));
      reverseReport = {
        ran: true,
        provider: checker.provider,
        prefix: ARGS.bucketPrefix || '(entire store)',
        objectsListed: listing.keys.length,
        truncated: listing.truncated,
        listError: listing.error ?? null,
        orphanCount: orphanKeys.length,
        orphanSample: orphanKeys.slice(0, 200),
      };
    }
  }

  await prisma.$disconnect();

  // ---------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------

  const grandTotal = emptyCounts();
  for (const counts of modelCounts.values()) {
    for (const bucket of BUCKETS) grandTotal[bucket] += counts[bucket];
  }

  const report = {
    generatedAt: new Date().toISOString(),
    storage: resolution.config
      ? { provider: resolution.config.provider, configured: true }
      : { provider: null, configured: false, errors: resolution.errors },
    models: Object.fromEntries(
      MODEL_SPECS.map((s) => [s.model, modelCounts.get(s.model)]),
    ),
    grandTotal,
    missingInStore: missingRows,
    unverified: unverifiedRows,
    tenantBranding: brandingReport,
    reverse: reverseReport,
  };

  if (ARGS.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTable(report);
  }

  const needsAttention =
    grandTotal.MISSING_IN_STORE > 0 || (reverseReport?.orphanCount ?? 0) > 0;
  return needsAttention ? 1 : 0;
}

function printTable(report) {
  console.log('Storage reconciliation report — READ ONLY, nothing was changed\n');
  console.log(
    report.storage.configured
      ? `Configured backend: ${report.storage.provider}`
      : `No storage backend configured (${report.storage.errors?.join(' ') ?? 'unknown reason'})`,
  );
  console.log('');

  const header = ['MODEL', ...BUCKETS];
  const widths = [28, ...BUCKETS.map((b) => Math.max(b.length, 8))];
  console.log(header.map((h, i) => h.padEnd(widths[i])).join(' '));

  for (const [model, counts] of Object.entries(report.models)) {
    const row = [model, ...BUCKETS.map((b) => String(counts[b]))];
    console.log(row.map((c, i) => c.padEnd(widths[i])).join(' '));
  }

  console.log('-'.repeat(widths.reduce((a, b) => a + b + 1, 0)));
  const totalRow = ['TOTAL', ...BUCKETS.map((b) => String(report.grandTotal[b]))];
  console.log(totalRow.map((c, i) => c.padEnd(widths[i])).join(' '));

  if (report.tenantBranding) {
    const tb = report.tenantBranding;
    console.log('\nTenantBranding (via its Document — not included in the total above):');
    console.log(
      `  ${tb.tenantBrandingRows} tenant(s), ${tb.assetReferences} branding asset reference(s).`,
    );
    console.log(
      `  DURABLE=${tb.crossReference.DURABLE} MISSING_IN_STORE=${tb.crossReference.MISSING_IN_STORE} ` +
        `LEGACY_UNRECOVERABLE=${tb.crossReference.LEGACY_UNRECOVERABLE} NO_KEY=${tb.crossReference.NO_KEY} ` +
        `UNVERIFIED=${tb.crossReference.UNVERIFIED}`,
    );
    if (tb.danglingReferences > 0) {
      console.log(
        `  ${tb.danglingReferences} reference(s) point at a Document id that has no Document row (settings-level dangling reference).`,
      );
    }
    if (tb.noDocumentReference > 0) {
      console.log(
        `  ${tb.noDocumentReference} value(s) are not a /api/documents/{id}/view path and could not be resolved.`,
      );
    }
  }

  if (report.missingInStore.length > 0) {
    console.log(`\nMISSING_IN_STORE — real orphans (${report.missingInStore.length}):`);
    for (const row of report.missingInStore.slice(0, 50)) {
      console.log(
        `  ${row.model}.${row.field} id=${row.id}${row.tenantId ? ` tenant=${row.tenantId}` : ''} key=${row.storageKey}`,
      );
    }
    if (report.missingInStore.length > 50) {
      console.log(`  … and ${report.missingInStore.length - 50} more (use --json for the full list).`);
    }
  }

  if (report.unverified.length > 0) {
    console.log(`\nUNVERIFIED — could not be measured this run (${report.unverified.length}):`);
    const byReason = new Map();
    for (const row of report.unverified) {
      byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
    }
    for (const [reason, count] of byReason) {
      console.log(`  ${count}x — ${reason}`);
    }
  }

  if (report.reverse) {
    console.log('\nReverse direction (objects in the store with no database row):');
    if (!report.reverse.ran) {
      console.log(`  Not run: ${report.reverse.reason}`);
    } else if (report.reverse.listError) {
      console.log(`  Listing failed: ${report.reverse.listError}`);
    } else {
      console.log(
        `  Listed ${report.reverse.objectsListed} object(s) under prefix "${report.reverse.prefix}"` +
          `${report.reverse.truncated ? ' — TRUNCATED, this is a partial result, raise --max-list for a full listing' : ''}.`,
      );
      console.log(`  Orphan objects (no matching row): ${report.reverse.orphanCount}`);
      for (const key of report.reverse.orphanSample.slice(0, 20)) {
        console.log(`    ${key}`);
      }
      if (report.reverse.orphanCount > report.reverse.orphanSample.length) {
        console.log(
          `    … and ${report.reverse.orphanCount - report.reverse.orphanSample.length} more (use --json for up to 200).`,
        );
      }
    }
  } else {
    console.log('\nReverse direction (bucket -> database) not run. Pass --check-bucket to enable it.');
  }

  console.log('\nNothing was changed. This is a report only.');
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('storage-reconcile: unexpected failure:', error);
    process.exit(2);
  });
