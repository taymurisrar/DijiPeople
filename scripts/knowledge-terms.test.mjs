/*
 * Term normalisation for knowledge retrieval.
 *
 * The defect these cases pin, measured at `2d609724`: `retrieve-knowledge.mjs
 * "command bar"` returned `.agent/context/runtime-module-system.md` — the file
 * that documents the admin command bar contract — while `command-bar` did not,
 * and reported nine hits filtered below the relevance threshold instead.
 *
 * That failure is silent and reads as an absence of knowledge, which is the
 * one wrong conclusion this retrieval step exists to prevent. A caller has no
 * way to guess which spelling a given document happened to use.
 *
 * These are mutation tests, not illustrations. Each fails if a specific piece
 * of the normalisation is removed:
 *
 *   - remove the join-on-space   → "the hyphen and the space find each other"
 *   - remove the camelCase split → "a code spelling and a prose spelling"
 *   - change max to sum          → "a document is not twice as relevant"
 *   - remove the extension strip → "a filename behaves like the name in it"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize, spellings, scoreTerm } from './lib/knowledge-terms.mjs';

/** A document scored the way retrieve-knowledge.mjs scores one. */
const doc = ({ name = '', headings = '', body = '' }) => ({
  name: name.toLowerCase(),
  headings: headings.toLowerCase(),
  body: body.toLowerCase(),
});

test('tokenize splits every convention this repository writes identifiers in', () => {
  assert.deepEqual(tokenize('ModuleActionBar'), ['module', 'action', 'bar']);
  assert.deepEqual(tokenize('command-bar'), ['command', 'bar']);
  assert.deepEqual(tokenize('command bar'), ['command', 'bar']);
  assert.deepEqual(tokenize('tenant_settings'), ['tenant', 'settings']);
  assert.deepEqual(tokenize('employees.read'), ['employees', 'read']);
  /* Acronym runs: RBACMatrix must not become ['r','b','a','c','matrix']. */
  assert.deepEqual(tokenize('RBACMatrix'), ['rbac', 'matrix']);
});

test('a single word expands to itself and gains no spurious spellings', () => {
  assert.deepEqual(spellings('payroll'), ['payroll']);
});

test('the hyphen and the space find each other — the original defect', () => {
  /*
   * Modelled on the real document: `.agent/context/runtime-module-system.md`
   * has "The record command bar is a default, not a per-module decision" as a
   * heading and uses the spaced spelling throughout. The hyphenated query
   * scored zero against it.
   */
  const target = doc({
    name: '.agent/context/runtime-module-system.md',
    headings: '### The record command bar is a default, not a per-module decision',
    body: 'the record command bar is a default. define() builds each command bar from capabilities.',
  });
  assert.ok(scoreTerm('command-bar', target) > 0, 'hyphenated query must reach a spaced document');
  assert.equal(scoreTerm('command-bar', target), scoreTerm('command bar', target));
});

test('a code spelling and a prose spelling reach the same document', () => {
  const target = doc({ body: 'the command bar renders what the registry declares' });
  assert.ok(scoreTerm('ModuleActionBar', doc({ body: 'moduleactionbar renders' })) > 0);
  assert.equal(scoreTerm('ModuleActionBar', target), scoreTerm('module-action-bar', target));
});

test('a filename behaves like the component name inside it', () => {
  const target = doc({ body: 'the command bar' });
  assert.equal(scoreTerm('module-action-bar.tsx', doc({ body: 'module action bar' })), scoreTerm('ModuleActionBar', doc({ body: 'module action bar' })));
  assert.ok(scoreTerm('command-bar.tsx', target) > 0);
});

test('a document is not credited once per spelling it happens to use', () => {
  /*
   * Max across spellings, never sum — and this is the case that tells them
   * apart. Both documents mention the concept three times. Summing scores them
   * equal, so a document with inconsistent conventions would rank alongside one
   * that uses a single spelling consistently, purely for being inconsistent.
   * Under max, the spread-out document scores its best single spelling.
   *
   * Mutation: change `if (value > best) best = value` to `best += value` in
   * `scoreTerm` and this assertion becomes 3 < 3.
   */
  const mixed = doc({ body: 'command bar and command-bar and commandbar' });
  const consistent = doc({ body: 'command bar command bar command bar' });
  assert.ok(
    scoreTerm('command-bar', mixed) < scoreTerm('command-bar', consistent),
    'summing spellings would score these equal',
  );
});

test('filename and heading still outrank a body mention', () => {
  /* The original weighting is deliberately unchanged; only the matching moved. */
  const inName = doc({ name: 'docs/knowledge/modules/payroll.md', body: 'unrelated' });
  const inHeading = doc({ headings: '## payroll', body: 'unrelated' });
  const inBody = doc({ body: 'payroll' });
  assert.ok(scoreTerm('payroll', inName) > scoreTerm('payroll', inHeading));
  assert.ok(scoreTerm('payroll', inHeading) > scoreTerm('payroll', inBody));
});

test('an unrelated term scores nothing — normalisation must not widen queries', () => {
  /*
   * The guard against the fuzzy-matching alternative: expanding punctuation is
   * exact, so `partner-experience` must not drag in every document about
   * partners, and a shared word must not make two modules interchangeable.
   */
  const partners = doc({ name: 'docs/knowledge/modules/partners.md', body: 'partners and leads' });
  assert.equal(scoreTerm('attendance', partners), 0);
  assert.equal(scoreTerm('payroll', doc({ body: 'the pay run' })), 0);
});
