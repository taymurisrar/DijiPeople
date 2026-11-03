import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finalizeSessionRecord } from './lib/session-registry.mjs';

function fixture(eol = '\n', extra = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sess-'));
  fs.mkdirSync(path.join(root, 'docs', 'sessions'), { recursive: true });
  const body = ['SESSION_ID: SESSION-0900', 'TITLE: t', 'STATUS: ACTIVE', 'LAST_HEARTBEAT: 2026-01-01T00:00:00.000Z', '', '# Intent', 'STATUS: this line in the body must never be rewritten', extra].join(eol);
  const file = path.join(root, 'docs', 'sessions', 'SESSION-0900-example.md');
  fs.writeFileSync(file, body);
  return { root, file };
}

test('finishing closes the durable record, not only the registry', () => {
  const { root, file } = fixture();
  const r = finalizeSessionRecord(root, 'SESSION-0900', 'COMPLETE', '2026-11-03T00:00:00.000Z');
  assert.equal(r.updated, true);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^STATUS: COMPLETE$/m);
  assert.match(text, /^LAST_HEARTBEAT: 2026-11-03T00:00:00.000Z$/m);
});

test('only the header block is rewritten; a STATUS-looking line in the body is the author\'s', () => {
  const { root, file } = fixture();
  finalizeSessionRecord(root, 'SESSION-0900', 'COMPLETE');
  assert.match(fs.readFileSync(file, 'utf8'), /STATUS: this line in the body must never be rewritten/);
});

test('idempotent: finishing twice changes nothing the second time', () => {
  const { root } = fixture();
  finalizeSessionRecord(root, 'SESSION-0900', 'COMPLETE', '2026-11-03T00:00:00.000Z');
  const again = finalizeSessionRecord(root, 'SESSION-0900', 'COMPLETE', '2026-11-03T00:00:00.000Z');
  assert.equal(again.updated, false);
});

test('preserves CRLF line endings', () => {
  const { root, file } = fixture('\r\n');
  finalizeSessionRecord(root, 'SESSION-0900', 'ABANDONED');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text), 'every newline stays CRLF');
  assert.match(text, /^STATUS: ABANDONED\r?$/m);
});

test('a missing record is reported, never silently ignored', () => {
  const { root } = fixture();
  const r = finalizeSessionRecord(root, 'SESSION-0777', 'COMPLETE');
  assert.equal(r.updated, false);
  assert.match(r.reason, /no record file/);
});
