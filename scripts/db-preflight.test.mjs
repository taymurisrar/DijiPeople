/*
 * REG-078 — the Database Agent's verdict cannot say PASS over a failing field.
 *
 * BUG-0083: `scripts/db-preflight.mjs` reported `DATABASE_AGENT_STATUS = PASS`
 * and exited 0 against a database with 213 committed migrations unapplied,
 * while printing `MIGRATION_STATUS = PENDING_MIGRATIONS` and
 * `LOCAL_DATABASE_STATUS = DATABASE_MISMATCH` in the same output. Every defect
 * was in the status → verdict mapping, not in the checks producing the statuses
 * — the checks were right and the headline overruled them.
 *
 * So the mapping is what is pinned here. These cases are the mutation test: each
 * one fails if `PENDING_MIGRATIONS`, `DATABASE_MISMATCH` or `UNREACHABLE` is
 * removed from the blocking list, or if UNKNOWN is allowed to reach PASS again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyVerdict } from './db-preflight.mjs';

/** All four links agreeing — the only state PASS is reachable from. */
const coherent = {
  schema: { status: 'CURRENT' },
  prismaClient: { status: 'CURRENT' },
  migration: { status: 'CURRENT' },
  database: { status: 'CURRENT' },
};

const withState = (overrides) => ({ ...coherent, ...overrides });

test('four agreeing links are the only route to PASS', () => {
  assert.equal(classifyVerdict(coherent).verdict, 'PASS');
});

test('pending migrations block — the exact BUG-0083 headline', () => {
  const result = classifyVerdict(
    withState({
      migration: { status: 'PENDING_MIGRATIONS' },
      database: { status: 'DATABASE_MISMATCH' },
    }),
  );

  assert.equal(result.verdict, 'BLOCKED');
  assert.ok(
    result.blocking.includes('MIGRATION_STATUS=PENDING_MIGRATIONS'),
    'a database behind the committed history must be named as blocking',
  );
});

test('an unreachable database blocks rather than passing quietly', () => {
  assert.equal(classifyVerdict(withState({ database: { status: 'UNREACHABLE' } })).verdict, 'BLOCKED');
});

test('migration drift blocks and is never repaired away', () => {
  assert.equal(classifyVerdict(withState({ migration: { status: 'MIGRATION_DRIFT' } })).verdict, 'BLOCKED');
});

test('a stale generated client blocks — BUG-0060, BUG-0068', () => {
  assert.equal(classifyVerdict(withState({ prismaClient: { status: 'CLIENT_MISMATCH' } })).verdict, 'BLOCKED');
});

test('UNKNOWN never reports PASS', () => {
  for (const field of ['schema', 'prismaClient', 'migration', 'database']) {
    const result = classifyVerdict(withState({ [field]: { status: 'UNKNOWN' } }));
    assert.notEqual(result.verdict, 'PASS', `${field} = UNKNOWN must not pass`);
    assert.equal(result.verdict, 'INCOMPLETE');
  }
});

test('INCOMPLETE and BLOCKED stay distinct — the responses differ', () => {
  // "Could not look" and "looked, and it is wrong" need different next actions:
  // run the check somewhere it can see, versus repair or diagnose.
  assert.equal(classifyVerdict(withState({ migration: { status: 'UNKNOWN' } })).verdict, 'INCOMPLETE');
  assert.equal(classifyVerdict(withState({ migration: { status: 'PENDING_MIGRATIONS' } })).verdict, 'BLOCKED');
});

test('a known failure outranks an unresolved one', () => {
  // Both present: the actionable problem is the one to report.
  const result = classifyVerdict({
    schema: { status: 'UNKNOWN' },
    prismaClient: { status: 'UNKNOWN' },
    migration: { status: 'PENDING_MIGRATIONS' },
    database: { status: 'DATABASE_MISMATCH' },
  });

  assert.equal(result.verdict, 'BLOCKED');
  assert.ok(result.unknownFields.length > 0, 'the unresolved fields are still reported, not discarded');
});

test('a schema that could not be validated is not a schema known to be stale', () => {
  // schemaStatus() returned STALE when the prisma CLI was simply absent, which
  // accuses a schema nobody checked. UNKNOWN is INCOMPLETE; STALE is BLOCKED.
  assert.equal(classifyVerdict(withState({ schema: { status: 'UNKNOWN' } })).verdict, 'INCOMPLETE');
  assert.equal(classifyVerdict(withState({ schema: { status: 'STALE' } })).verdict, 'BLOCKED');
});
