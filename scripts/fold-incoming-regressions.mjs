/*
 * Folds docs/qa/regressions/_incoming/<stream>.md into the single register.
 *
 * Ten parallel agents cannot all append to index.md — they conflict on every
 * line — so each writes its own _incoming file against a reserved REG range and
 * the coordinator folds them in here. The preamble above the first `### REG-`
 * heading is per-stream commentary for the coordinator, not register content,
 * so it is dropped.
 */
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';

const INDEX = 'docs/qa/regressions/index.md';
const DIR = 'docs/qa/regressions/_incoming';
if (!existsSync(DIR)) { console.log('no _incoming directory; nothing to fold'); process.exit(0); }

const index = readFileSync(INDEX, 'utf8');
const existing = new Set([...index.matchAll(/^### (REG-\d+)/gm)].map((m) => m[1]));
let body = index.replace(/\s*$/, '');
const folded = [];
let added = 0;

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) {
  const raw = readFileSync(`${DIR}/${name}`, 'utf8');
  const start = raw.search(/^### REG-/m);
  if (start === -1) { console.log(`  ${name}: no REG entries, skipped`); continue; }
  const entries = raw.slice(start).replace(/\s*$/, '');
  const ids = [...entries.matchAll(/^### (REG-\d+)/gm)].map((m) => m[1]);
  const dupes = ids.filter((id) => existing.has(id));
  if (dupes.length) { console.error(`  ${name}: REFUSED — ${dupes.join(', ')} already in the register`); process.exitCode = 1; continue; }
  ids.forEach((id) => existing.add(id));
  // index.md is CRLF; an LF block pasted in would leave mixed endings mid-file.
  body += '\r\n\r\n' + entries.replace(/\r?\n/g, '\r\n');
  folded.push(name); added += ids.length;
  console.log(`  ${name}: folded ${ids.length} entry(ies) — ${ids.join(', ')}`);
}

if (process.exitCode === 1) { console.error('\nNothing written.'); process.exit(1); }
if (!added) { console.log('nothing to fold'); process.exit(0); }
writeFileSync(INDEX, body + '\r\n');
folded.forEach((n) => rmSync(`${DIR}/${n}`));
if (!readdirSync(DIR).length) rmSync(DIR, { recursive: true });
console.log(`\nFolded ${added} entry(ies) from ${folded.length} file(s) into ${INDEX}.`);
