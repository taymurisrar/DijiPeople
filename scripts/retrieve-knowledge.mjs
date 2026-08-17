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

import {
  resolveMappings,
  agentOwnedVaultPaths,
  hasMeaningfulContent,
} from './lib/obsidian-mappings.mjs';
import { resolveObsidianConfig } from './lib/obsidian-config.mjs';

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

/*
 * A note with a title, headings and nothing under them is not knowledge — it is
 * a filename. Bootstrap scaffolding matched generic terms and pushed real notes
 * below the relevance threshold, so an empty vault could out-rank the
 * repository. Same policy as the sync, from the same module.
 */
const hasSubstance = (body) => hasMeaningfulContent(body);

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
    if (!hasSubstance(body)) continue;
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
  /*
   * Bugs and backlog sit at high authority deliberately. They are the answer to
   * "what is already known to be wrong here", which is the question a
   * specialist's KNOWN_MISTAKES_TO_AVOID block and the Architect's
   * BACKLOG_PRECHECK both exist to ask — and the one most expensive to get
   * wrong, because getting it wrong means writing a defect somebody already
   * documented.
   */
  ['open bugs', 'docs/bugs', 3],
  ['backlog', 'docs/backlog/items', 3],
  /*
   * Parent tasks answer a question none of the others do: "is somebody already
   * working on this, and where did they get to?" A specialist that misses an
   * in-flight task on the same modules duplicates its work or conflicts with it.
   */
  ['parent tasks', 'docs/tasks', 3],
  ['regression register', 'docs/qa/regressions', 4],
  ['known bug patterns', 'docs/qa/known-bug-patterns', 5],
  ['QA runs', 'docs/qa/runs', 5],
  ['knowledge', 'docs/knowledge', 6],
  ['engineering history', 'docs/engineering-history/tasks', 6],
  ['agent context', '.agent/context', 2],
  ['architecture docs', 'docs/architecture', 6],
  ['decisions', 'docs/decisions', 6],
];

/*
 * Generated indexes are tables of contents, not knowledge. `docs/backlog/items`
 * avoids this by searching the record directory rather than the bucket pages;
 * task records sit alongside their indexes, so they are excluded by name. A hit
 * that answers a query with "here is a list of everything" is worse than no hit
 * — it occupies a relevance slot a real record wanted.
 */
const GENERATED_INDEX = /[/\\](index|active|blocked|completed|README)\.md$/i;

const results = [];
for (const [label, rel, authority] of REPO_SOURCES) {
  const hits = collect(label, join(ROOT, rel), { authority });
  results.push(...(rel === 'docs/tasks' ? hits.filter((h) => !GENERATED_INDEX.test(h.path)) : hits));
}

// ---------------------------------------------------------------- obsidian

/*
 * The vault path lives in a gitignored local config, so retrieval is a
 * per-developer capability. Its absence is reported, never fatal — the
 * repository is self-sufficient by design.
 */
let obsidianContext = 'UNAVAILABLE';
let obsidianDetail = 'no vault configuration found in any worktree';
/* Every vault note this retrieval drew on, reported as OBSIDIAN_CONTEXT_USED. */
const obsidianUsed = [];

/*
 * Resolution spans worktrees — see scripts/lib/obsidian-config.mjs. Reading only
 * this worktree's config made inbound retrieval silently vault-less in every
 * task worktree, which is precisely where planning happens.
 */
const resolution = resolveObsidianConfig(ROOT);
const configPath = resolution.configPath;

{
  {
    const config = resolution.config ?? {};
    const { vaultPath } = resolution;
    if (!vaultPath) {
      obsidianDetail =
        resolution.status === 'INVALID'
          ? `configuration found but unusable — ${resolution.attempts.map((a) => a.result).join('; ')}`
          : 'no vault configuration found in this worktree, the primary checkout, the shared Git directory or the environment';
    } else {
      obsidianContext = 'AVAILABLE';
      obsidianDetail = vaultPath;

      /*
       * Every note the sync writes is a copy of something already searched
       * above, at higher authority. Returning both double-counts one fact and
       * makes the vault look more informative than it is.
       *
       * The exclusions come from the SHARED mapping table, not from the local
       * config. Two earlier versions of this got it wrong in two different
       * ways: one filtered only on "/Generated/", and the QA mappings
       * (11 - Agent Knowledge/QA/Runs, …) carry no such segment; the next read
       * `config.mappings`, so a config that omitted the key — which is now the
       * recommended form — excluded nothing. Both times every QA note came back
       * twice, once from the repository and once from its own copy.
       */
      const agentOwned = agentOwnedVaultPaths(resolveMappings(config).mappings);

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
        return (
          /\/99 - Templates\//i.test(norm) ||
          /\/README\.md$/i.test(norm) ||
          /\/(Module|Architecture Decision|Architecture) Index\.md$/i.test(norm) ||
          /\/DijiPeople\.md$/i.test(norm)
        );
      };

      /*
       * The inbound half of the bidirectional relationship.
       *
       * These folders carry what the repository cannot know: what was asked for,
       * what a client said, what was decided in a room. A note here is not
       * implementation truth — the code is — but it is the only source for
       * *intent*, and planning without it produces work that is technically
       * correct and not what anybody wanted.
       *
       * They are boosted rather than filtered to, so a manual architecture note
       * outside these folders still surfaces.
       */
      const MANUAL_INTENT = [
        '04 - Requirements',
        '09 - Meetings',
        '10 - Client Feedback',
        '01 - Product',
        '05 - Decisions',
      ];
      const intentFolder = (p) => {
        const norm = p.replace(/\\/g, '/');
        return MANUAL_INTENT.find((folder) => norm.includes(`/${folder}/`)) ?? null;
      };

      const vaultHits = collect('obsidian', vaultPath, { authority: 7 })
        .filter((h) => !isAgentOwned(h.path) && !isScaffolding(h.path))
        .map((hit) => {
          const folder = intentFolder(hit.path);
          return folder
            ? { ...hit, source: 'obsidian:intent', intentFolder: folder, score: hit.score * 1.5 }
            : hit;
        });

      results.push(...vaultHits);
      obsidianUsed.push(
        ...vaultHits.map((hit) => ({ path: hit.path, intentFolder: hit.intentFolder ?? null })),
      );

      if (!results.some((h) => String(h.source).startsWith('obsidian'))) {
        obsidianContext = 'AVAILABLE_NO_MANUAL_NOTES';
        obsidianDetail = `${vaultPath} — readable, but no manual notes matched (the vault currently holds only generated knowledge and scaffolding)`;
      }
    }
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

/* Only the notes that actually made the cut count as context used. */
const shownPaths = new Set(shown.map((hit) => hit.path));
const contextUsed = obsidianUsed.filter((entry) => shownPaths.has(entry.path));

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        terms,
        OBSIDIAN_CONTEXT: obsidianContext,
        obsidian: obsidianDetail,
        OBSIDIAN_CONTEXT_USED: contextUsed,
        matches: shown,
        totalMatches: ranked.length,
      },
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

  /*
   * The Architect reports this block in the plan. Naming the manual notes a
   * decision drew on is what makes an intent claim checkable — and what lets
   * somebody correct the plan by pointing at the note it missed.
   */
  console.log(`\nOBSIDIAN_CONTEXT_USED (${contextUsed.length})`);
  if (contextUsed.length) {
    for (const entry of contextUsed) {
      console.log(`  ${entry.intentFolder ? `[${entry.intentFolder}] ` : ''}${entry.path}`);
    }
  } else {
    console.log('  none — no manual vault note informed this retrieval');
  }

  console.log('\nAuthority order: AGENTS.md → .agent/context → SOURCE CODE → bugs/backlog → QA → knowledge → Obsidian.');
  console.log('Obsidian carries intent and history. The code is implementation truth.');
  console.log('A hit under docs/bugs or docs/backlog is something already known to be wrong');
  console.log('or outstanding here — read it before writing code, not after review.');
  console.log('');
  console.log('When a vault note and the code disagree, classify — never silently resolve:');
  console.log('  EXPECTED_CHANGE · STALE_OBSIDIAN_NOTE · STALE_REPOSITORY_DOC');
  console.log('  UNIMPLEMENTED_REQUIREMENT · PRODUCT_DECISION_REQUIRED · UNCLEAR_CONFLICT');
  console.log('An UNIMPLEMENTED_REQUIREMENT becomes a backlog record, not a code change.');
}
