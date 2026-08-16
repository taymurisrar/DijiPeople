#!/usr/bin/env node
/*
 * Allocate a durable record id, safely, across concurrent Architect sessions.
 *
 *   node scripts/allocate-id.mjs bug
 *   node scripts/allocate-id.mjs backlog --session SESSION-0003
 *   node scripts/allocate-id.mjs task --note "payroll production readiness"
 *   node scripts/allocate-id.mjs scenario --scope AUTH
 *   node scripts/allocate-id.mjs qa-run --slug 2026-08-17-payroll-abc1234.md
 *   node scripts/allocate-id.mjs --list
 *   node scripts/allocate-id.mjs --prune
 *
 * The record-scaffolding scripts (`new-bug.mjs`, `new-backlog-item.mjs`,
 * `new-task.mjs`, …) call the same allocator, so a human running this by hand
 * and an agent running the scaffolder cannot collide either.
 *
 * Exit codes: 0 allocated / verified · 1 refused · 2 usage error
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_KINDS,
  ID_KINDS,
  PATH_KINDS,
  allocateId,
  claimPath,
  highestAllocated,
  pruneReservations,
  readReservations,
} from './lib/id-allocator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (name, fallback = '') => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? '');
};
const has = (name) => argv.includes(`--${name}`);

const kind = argv.find((arg) => !arg.startsWith('--'));

if (has('help') || (!kind && !has('list') && !has('prune'))) {
  console.error('Usage: node scripts/allocate-id.mjs <kind> [options]');
  console.error('');
  console.error(`  kinds      ${ALL_KINDS.join(' | ')}`);
  console.error('  --scope    required for scoped kinds (scenario): AUTH, TENANT, PAYROLL, …');
  console.error('  --slug     required for date-named kinds (qa-run, history, release)');
  console.error('  --session  SESSION-nnnn that owns the allocation');
  console.error('  --note     why it was taken, for the ledger');
  console.error('  --json     machine-readable output');
  console.error('  --list     show outstanding reservations');
  console.error('  --prune    drop reservations whose record now exists');
  process.exit(2);
}

const asJson = has('json');

try {
  if (has('list')) {
    const entries = readReservations(ROOT);
    if (asJson) {
      console.log(JSON.stringify({ reservations: entries }, null, 2));
    } else if (!entries.length) {
      console.log('No outstanding id reservations.');
    } else {
      console.log(`Outstanding id reservations (${entries.length}):`);
      for (const entry of entries) {
        console.log(
          `  ${entry.id.padEnd(16)} ${entry.kind.padEnd(10)} ${entry.sessionId || '—'}  ${entry.allocatedAt}` +
            (entry.note ? `  — ${entry.note}` : ''),
        );
      }
      console.log('');
      console.log('A reservation is released by creating the record, then --prune.');
      console.log('Reservations are never reused: a gap in a sequence is cheaper than a collision.');
    }
    process.exit(0);
  }

  if (has('prune')) {
    const { pruned, kept } = pruneReservations(ROOT);
    if (asJson) {
      console.log(JSON.stringify({ pruned: pruned.map((e) => e.id), kept: kept.map((e) => e.id) }, null, 2));
    } else {
      console.log(`Pruned ${pruned.length} consumed reservation(s); ${kept.length} still outstanding.`);
      for (const entry of pruned) console.log(`  released  ${entry.id}`);
      for (const entry of kept) console.log(`  pending   ${entry.id} — record not created yet`);
    }
    process.exit(0);
  }

  if (PATH_KINDS[kind]) {
    const slug = flag('slug');
    if (!slug) {
      console.error(`--slug is required for "${kind}" — these records are named by date, not numbered.`);
      process.exit(2);
    }
    const claim = claimPath(ROOT, kind, slug);
    if (asJson) {
      console.log(JSON.stringify(claim, null, 2));
    } else if (claim.available) {
      console.log(claim.path);
    } else {
      console.error(`${claim.path} already exists —` +
        `${claim.conflictsInWorkingTree ? ' in the working tree' : ''}` +
        `${claim.conflictsInRefs ? ' on another branch' : ''}.`);
      console.error('Choose a distinct slug. Overwriting it would delete somebody else\'s record on merge.');
    }
    process.exit(claim.available ? 0 : 1);
  }

  if (!ID_KINDS[kind]) {
    console.error(`Unknown kind "${kind}". Known kinds: ${ALL_KINDS.join(', ')}`);
    process.exit(2);
  }

  const scope = flag('scope');
  const before = highestAllocated(ROOT, kind, { scope });
  const id = allocateId(ROOT, kind, {
    scope,
    sessionId: flag('session'),
    note: flag('note'),
  });

  if (asJson) {
    console.log(JSON.stringify({ id, kind, scope: scope.toUpperCase() || null, previousHighest: before }, null, 2));
  } else {
    console.log(id);
  }
} catch (error) {
  console.error(String(error.message));
  process.exit(1);
}
