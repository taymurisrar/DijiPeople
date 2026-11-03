#!/usr/bin/env node
// Governed learning loop (policy LRN-001).
//
//   defect / failed CI / review feedback -> root cause -> LESSON (PROPOSED)
//     -> human review (ACCEPTED | REJECTED) -> change lands in a reviewed commit
//     -> LESSON marked APPLIED with the policy id / file it created -> future sessions retrieve it
//
//   node scripts/lessons.mjs new "<title>" --source CI|BUG|REVIEW --ref <id> --proposes rule|skill|validator|agent
//   node scripts/lessons.mjs check           validate every lesson (CI)
//   node scripts/lessons.mjs suggest         recurrence in docs/bugs not yet covered by a lesson
//   node scripts/lessons.mjs stale           ACCEPTED-but-unapplied, and APPLIED lessons whose target vanished
//
// Nothing here edits a rule, skill or agent. A lesson is a proposal; the change
// it proposes is made by a person or by an agent in an ordinary reviewed PR, so
// there is no self-modifying policy and no silent accumulation (a lesson that
// is neither applied nor rejected shows up in `stale`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs/engineering/lessons');
const STATUSES = ['PROPOSED', 'ACCEPTED', 'REJECTED', 'APPLIED'];
const SOURCES = ['CI', 'BUG', 'REVIEW'];
const PROPOSES = ['rule', 'skill', 'validator', 'agent'];
const STALE_DAYS = 30;

export function parseLesson(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

export function validateLesson(fm, file, catalogueIds, now = new Date()) {
  const errs = [];
  const warn = [];
  const need = (k) => { if (!fm[k]) errs.push(`${file}: missing "${k}"`); };
  ['id', 'status', 'source', 'ref', 'rootCause', 'proposes', 'created'].forEach(need);
  if (fm.status && !STATUSES.includes(fm.status)) errs.push(`${file}: status must be ${STATUSES.join('|')}`);
  if (fm.source && !SOURCES.includes(fm.source)) errs.push(`${file}: source must be ${SOURCES.join('|')}`);
  if (fm.proposes && !PROPOSES.includes(fm.proposes)) errs.push(`${file}: proposes must be ${PROPOSES.join('|')}`);
  if (fm.rootCause && fm.rootCause.length < 25) errs.push(`${file}: rootCause must state a cause, not a label`);
  if (['ACCEPTED', 'APPLIED', 'REJECTED'].includes(fm.status) && !fm.reviewedBy) errs.push(`${file}: ${fm.status} requires reviewedBy (a human decision)`);
  if (fm.status === 'APPLIED') {
    if (!fm.appliedIn) errs.push(`${file}: APPLIED requires appliedIn (policy id or file)`);
    else if (/^[A-Z]+-\d{3}$/.test(fm.appliedIn) && !catalogueIds.has(fm.appliedIn)) errs.push(`${file}: appliedIn ${fm.appliedIn} is not in the policy catalogue`);
    else if (!/^[A-Z]+-\d{3}$/.test(fm.appliedIn) && !fs.existsSync(path.join(ROOT, fm.appliedIn))) errs.push(`${file}: appliedIn ${fm.appliedIn} does not exist`);
  }
  if (fm.status === 'PROPOSED' && fm.appliedIn) errs.push(`${file}: a PROPOSED lesson cannot already be applied`);
  if (['PROPOSED', 'ACCEPTED'].includes(fm.status) && fm.created) {
    const age = (now - new Date(fm.created)) / 86400000;
    if (age > STALE_DAYS) warn.push(`${file}: ${fm.status} for ${Math.floor(age)} days — apply, reject or re-justify`);
  }
  return { errs, warn };
}

function loadLessons() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /^LESSON-\d{4}.*\.md$/.test(f)).map((f) => ({ file: f, fm: parseLesson(fs.readFileSync(path.join(DIR, f), 'utf8')) }));
}

function catalogueIds() {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/engineering/policy-catalogue.json'), 'utf8'));
  return new Set(cat.policies.map((p) => p.id));
}

function check() {
  const ids = catalogueIds();
  const seen = new Set();
  const errs = [];
  const warns = [];
  for (const { file, fm } of loadLessons()) {
    if (!fm) { errs.push(`${file}: no frontmatter`); continue; }
    if (seen.has(fm.id)) errs.push(`${file}: duplicate id ${fm.id}`);
    seen.add(fm.id);
    if (!file.startsWith(fm.id ?? '?')) errs.push(`${file}: filename must start with its id`);
    const r = validateLesson(fm, file, ids);
    errs.push(...r.errs);
    warns.push(...r.warn);
  }
  warns.forEach((w) => console.warn('warn: ' + w));
  if (errs.length) { console.error(`lessons check FAILED:\n  x ${errs.join('\n  x ')}`); process.exit(1); }
  console.log(`lessons check: ${seen.size} lesson(s) valid`);
}

function suggest() {
  const dir = path.join(ROOT, 'docs/bugs');
  const tally = {};
  for (const f of fs.readdirSync(dir).filter((x) => /^BUG-/.test(x))) {
    const head = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).slice(0, 30).join('\n');
    const type = /^Type:\s*(.+)$/m.exec(head)?.[1]?.trim();
    const mods = (/^AffectedModules:\s*\[(.*)\]/m.exec(head)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const mod of mods) { const k = `${type} @ ${mod}`; (tally[k] ??= []).push(f.slice(0, 8)); }
  }
  const covered = loadLessons().map((l) => `${l.fm?.ref ?? ''} ${l.fm?.rootCause ?? ''}`).join(' ').toLowerCase();
  const rows = Object.entries(tally).filter(([k, v]) => v.length >= 4 && !covered.includes(k.split(' @ ')[1].toLowerCase())).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  console.log('Recurring defect clusters (>=4 records) with no lesson naming the module:');
  for (const [k, v] of rows) console.log(`  ${String(v.length).padStart(3)}  ${k}   e.g. ${v.slice(0, 3).join(' ')}`);
  console.log('\nThese are CANDIDATES. Read the records, write a rootCause, then `lessons.mjs new`. Clusters are evidence of where to look, not conclusions.');
}

function stale() {
  const ids = catalogueIds();
  for (const { file, fm } of loadLessons()) {
    if (!fm) continue;
    const r = validateLesson(fm, file, ids);
    r.warn.forEach((w) => console.log('stale: ' + w));
    r.errs.filter((e) => /does not exist|not in the policy/.test(e)).forEach((e) => console.log('broken target: ' + e));
  }
}

function create(argv) {
  const title = argv[0];
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  if (!title || !opt('--source') || !opt('--ref') || !opt('--proposes')) { console.error('usage: new "<title>" --source CI|BUG|REVIEW --ref <id> --proposes rule|skill|validator|agent'); process.exit(2); }
  fs.mkdirSync(DIR, { recursive: true });
  const n = Math.max(0, ...loadLessons().map((l) => Number(/(\d{4})/.exec(l.file)?.[1] ?? 0))) + 1;
  const id = `LESSON-${String(n).padStart(4, '0')}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const file = path.join(DIR, `${id}-${slug}.md`);
  fs.writeFileSync(file, `---\nid: ${id}\nstatus: PROPOSED\nsource: ${opt('--source')}\nref: ${opt('--ref')}\nrootCause: TODO state the mechanism, not the symptom\nproposes: ${opt('--proposes')}\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n\n# ${id} — ${title}\n\n## Evidence\n\n## Proposed change\n\n## Why this is not already covered\n`);
  console.log(file);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = { check, suggest, stale, new: () => create(rest) };
  if (!commands[cmd]) {
    console.error('usage: lessons.mjs new|check|suggest|stale');
    process.exit(2);
  }
  commands[cmd]();
}
