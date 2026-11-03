#!/usr/bin/env node
// SessionStart hook: a compact, deterministic orientation so a fresh session
// finds the engineering rules without being told. Output goes to the model's
// context, so it stays short and never fails the session.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const sh = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const branch = sh(['branch', '--show-current']) || '(detached)';
const dirty = sh(['status', '--short']).split('\n').filter(Boolean).length;
const handoffs = fs.existsSync('docs/engineering/handoffs')
  ? fs.readdirSync('docs/engineering/handoffs').filter((f) => f.endsWith('.md')).sort().slice(-1)
  : [];

const lines = [
  `DijiPeople session: branch ${branch}, ${dirty} uncommitted path(s).`,
  'Rules: AGENTS.md (authoritative) -> .claude/rules (path-scoped) -> docs/engineering/policy-catalogue.json (ids + enforcement).',
  'Before changing files: `node scripts/session.mjs list` and `check --paths <paths>`. Ordinary work targets develop; never push/merge main.',
  'Before pushing: `npm run preflight`. Owner decides: pricing/entitlements, business rules, destructive data changes, security weakening, breaking API, prod deploys.',
];
if (handoffs.length) lines.push(`Latest handoff: docs/engineering/handoffs/${handoffs[0]}`);
console.log(lines.join('\n'));
