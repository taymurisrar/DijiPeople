#!/usr/bin/env node
/*
 * Selective knowledge retrieval for the Architect's RELEVANT_KNOWLEDGE_RETRIEVAL
 * step. Searches repository knowledge and — when configured and readable — the
 * Obsidian vault, returning only notes matching the task's terms.
 *
 * The point is what it does NOT do: it never returns the whole vault. Bulk
 * loading buries the two notes that mattered under fifty that did not, and
 * produces agents that cite history irrelevant to the change in front of them.
 *
 * Search order mirrors the authority order in
 * .agent/context/knowledge-architecture.md. Obsidian is last because it is an
 * enrichment layer, never implementation truth.
 *
 *   node scripts/retrieve-knowledge.mjs attendance approvals
 *   node scripts/retrieve-knowledge.mjs --json tenant
 *
 * Exit codes: 0 always (absent knowledge is a finding, not a failure)
 *             2 usage error
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const terms = argv.filter((a) => !a.startsWith('--')).map((t) => t.toLowerCase());

if (!terms.length) {
  console.error('Usage: node scripts/retrieve-knowledge.mjs [--json] <term> [term…]');
  console.error('Terms are modules, features, business terms, clients, bug classes or topics.');
  process.exit(2);
}

// ------------------------------------------------------------------ scanning

function markdownFilesIn(dir, depth = 0) {
  if (!existsSync(dir) || depth > 6) return [];
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // unreadable directory is a finding, not a crash
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) out.push(...markdownFilesIn(full, depth + 1));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

/*
 * Score by where the term appears, not just how often. A term in the filename
 * or a heading is a much stronger signal of "this note is about that" than the
 * same word buried in a paragraph.
 */
function score(file, body) {
  const name = file.toLowerCase();
  const lower = body.toLowerCase();
  const headings = (body.match(/^#{1,3} .+$/gm) ?? []).join('\n').toLowerCase();

  let total = 0;
  const matched = [];
  for (const term of terms) {
    let termScore = 0;
    if (name.includes(term)) termScore += 10;
    if (headings.includes(term)) termScore += 5;
    const occurrences = lower.split(term).length - 1;
    if (occurrences) termScore += Math.min(occurrences, 5);
    if (termScore) matched.push(term);
    total += termScore;
  }
  // Reward notes matching several distinct terms — those are the on-topic ones.
  return matched.length > 1 ? total * matched.length : total;
}

function collect(label, dir, { authority }) {
  const files = markdownFilesIn(dir);
  const hits = [];
  for (const file of files) {
    let body;
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const value = score(file, body);
    if (!value) continue;
    const heading = (body.match(/^#\s+(.+)$/m) ?? [])[1] ?? '';
    hits.push({
      source: label,
      authority,
      path: file.startsWith(ROOT) ? file.slice(ROOT.length + 1).split(sep).join('/') : file,
      title: heading.trim(),
      score: value,
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------- repository

const REPO_SOURCES = [
  ['regression register', 'docs/qa/regressions', 4],
  ['known bug patterns', 'docs/qa/known-bug-patterns', 5],
  ['QA runs', 'docs/qa/runs', 5],
  ['knowledge', 'docs/knowledge', 6],
  ['agent context', '.agent/context', 2],
  ['architecture docs', 'docs/architecture', 6],
  ['decisions', 'docs/decisions', 6],
];

const results = [];
for (const [label, rel, authority] of REPO_SOURCES) {
  results.push(...collect(label, join(ROOT, rel), { authority }));
}

// ---------------------------------------------------------------- obsidian

/*
 * The vault path lives in a gitignored local config, so retrieval is a
 * per-developer capability. Its absence is reported, never fatal — the
 * repository is self-sufficient by design.
 */
let obsidianContext = 'UNAVAILABLE';
let obsidianDetail = 'no .obsidian-sync.local.json — vault path unknown';
const configPath = join(ROOT, '.obsidian-sync.local.json');

if (existsSync(configPath)) {
  try {
    const { vaultPath, mappings = [] } = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!vaultPath) {
      obsidianDetail = 'config has no vaultPath';
    } else if (!existsSync(vaultPath)) {
      obsidianDetail = `vault path does not exist: ${vaultPath}`;
    } else {
      obsidianContext = 'AVAILABLE';
      obsidianDetail = vaultPath;

      /*
       * Every note the sync writes is a copy of something already searched
       * above, at higher authority. Returning both double-counts one fact and
       * makes the vault look more informative than it is.
       *
       * The exclusions are derived from the sync mappings rather than guessed:
       * an earlier version filtered only on "/Generated/", and the QA mappings
       * (11 - Agent Knowledge/QA/Runs, …) carry no such segment, so every QA
       * note came back twice.
       */
      const agentOwned = mappings
        .map((m) => String(m.to ?? '').replace(/[\\/]+$/, '').toLowerCase())
        .filter(Boolean);

      const isAgentOwned = (p) => {
        const norm = p.replace(/\\/g, '/').toLowerCase();
        return (
          /\/generated\//.test(norm) ||
          agentOwned.some((target) => norm.includes(`/${target.replace(/\\/g, '/')}/`))
        );
      };

      /*
       * Templates and folder READMEs are vault scaffolding — they explain what
       * to put in a folder, and match almost any generic term. Returning them
       * as "relevant knowledge" is pure noise, and made an empty vault look
       * populated.
       */
      const isScaffolding = (p) => {
        const norm = p.replace(/\\/g, '/');
        return /\/99 - Templates\//i.test(norm) || /\/README\.md$/i.test(norm);
      };

      results.push(
        ...collect('obsidian', vaultPath, { authority: 7 }).filter(
          (h) => !isAgentOwned(h.path) && !isScaffolding(h.path),
        ),
      );

      if (!results.some((h) => h.source === 'obsidian')) {
        obsidianContext = 'AVAILABLE_NO_MANUAL_NOTES';
        obsidianDetail = `${vaultPath} — readable, but no manual notes matched (the vault currently holds only generated knowledge and scaffolding)`;
      }
    }
  } catch (error) {
    obsidianDetail = `config unreadable: ${String(error.message).split('\n')[0]}`;
  }
}

// ------------------------------------------------------------------ output

/*
 * Rank by RELEVANCE, not authority. Authority decides which source to believe
 * when two disagree; it says nothing about whether a note is about your task.
 * Sorting by authority first returned every context file for the term "tenant"
 * — technically ordered, practically noise.
 *
 * The threshold is relative to the best hit: a note scoring a tenth of the top
 * match is a passing mention, not a reference.
 */
const sorted = results.sort((a, b) => b.score - a.score || a.authority - b.authority);
const topScore = sorted[0]?.score ?? 0;
const threshold = Math.max(3, topScore * 0.15);
const ranked = sorted.filter((hit) => hit.score >= threshold);
const TOP = 15;
const shown = ranked.slice(0, TOP);

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { terms, OBSIDIAN_CONTEXT: obsidianContext, obsidian: obsidianDetail, matches: shown, totalMatches: ranked.length },
      null,
      2,
    ),
  );
} else {
  console.log(`Terms: ${terms.join(', ')}`);
  console.log(`OBSIDIAN_CONTEXT = ${obsidianContext} (${obsidianDetail})\n`);

  if (!ranked.length) {
    console.log('No matching knowledge found.');
    console.log('That is a finding: this may be genuinely new ground, or the terms may be wrong.');
    console.log('Read the source code and the module AGENTS.md before assuming there is no history.');
  } else {
    for (const hit of shown) {
      console.log(`  [${hit.source}] ${hit.path}${hit.title ? ` — ${hit.title}` : ''}`);
    }
    if (ranked.length > TOP) {
      console.log(`\n… and ${ranked.length - TOP} more above the relevance threshold.`);
    }
    const filtered = sorted.length - ranked.length;
    if (filtered > 0) {
      console.log(`(${filtered} passing mentions filtered out as below the relevance threshold.)`);
    }
  }

  console.log('\nAuthority order: AGENTS.md → .agent/context → SOURCE CODE → QA → knowledge → Obsidian.');
  console.log('Obsidian carries intent and history. The code is implementation truth.');
}
