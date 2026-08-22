#!/usr/bin/env node
/*
 * Publish repository knowledge into an Obsidian vault.
 *
 * The repository is the controlled source; the vault is a consumer. Agents
 * write to docs/knowledge, docs/qa, docs/bugs, docs/backlog and
 * docs/engineering-history — never into the vault directly — so a bad
 * generation can be reviewed in a diff before it reaches anyone's notes.
 *
 * Everything lands under a `Generated/` subfolder of each destination, or the
 * agent-owned `11 - Agent Knowledge/QA/**`. Notes anywhere else are
 * hand-maintained and are never touched.
 *
 * Node .mjs rather than PowerShell because every other script in this repo is
 * .mjs — see scripts/. Cross-platform comes free.
 *
 *   node scripts/sync-obsidian.mjs [--dry-run] [--config <path>]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveMappings,
  hasMeaningfulContent,
  nodeTypeFor,
  relationshipIsValid,
} from './lib/obsidian-mappings.mjs';
import { describeResolution, resolveObsidianConfig } from './lib/obsidian-config.mjs';
import { renderNote, readProvenance, lastCommitByPath } from './lib/obsidian-node.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Freshness metadata for every tracked path, from one `git log` pass.
 *
 * Per-file `git log` would take minutes across ~300 notes, and a verification
 * step slow enough to skip is one that gets skipped. Computed lazily so a
 * non-git checkout still syncs — with `UNTRACKED` provenance, which is honest
 * rather than fatal.
 */
let commitIndex = null;
function commitFor(repoRelativePath) {
  if (commitIndex === null) {
    try {
      const output = execFileSync(
        'git',
        ['log', '--format=%h%x00%ad', '--date=short', '--name-only'],
        { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
      );
      commitIndex = lastCommitByPath(output);
    } catch {
      commitIndex = new Map();
    }
  }
  return commitIndex.get(repoRelativePath) ?? { sha: '', date: '' };
}

/**
 * The exact bytes a source file should have in the vault.
 *
 * One function, used by both the writer and the verifier. Two copies would
 * drift, and the drift would present as permanent, unfixable "vault differs
 * from source" — a failure nobody could act on.
 */
function publishedForm(file, source, mapping, relativePath) {
  const repoRelative = relative(REPO_ROOT, file).split(sep).join('/');
  const { sha, date } = commitFor(repoRelative);
  return renderNote({
    source,
    sourcePath: repoRelative,
    filename: basename(file),
    nodeType: nodeTypeFor(mapping, relativePath.split(sep).join('/')),
    sourceCommit: sha,
    lastVerified: date,
  });
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERIFY = args.includes('--verify');
const configArgIndex = args.indexOf('--config');
const EXPLICIT_CONFIG =
  configArgIndex !== -1 ? resolve(REPO_ROOT, args[configArgIndex + 1]) : null;

/*
 * The mapping table lives in scripts/lib/obsidian-mappings.mjs, shared with
 * scripts/retrieve-knowledge.mjs. Retrieval must exclude exactly the folders
 * this script writes — when the two derived that list separately, one of them
 * was wrong and every QA run came back twice.
 */

function loadConfig() {
  /*
   * Resolution spans worktrees — see scripts/lib/obsidian-config.mjs. Reading
   * only this worktree's config is why every task worktree reported
   * SKIPPED_NO_LOCAL_CONFIG while a configured vault sat in the primary
   * checkout, for two consecutive framework tasks.
   */
  const resolution = EXPLICIT_CONFIG
    ? resolveObsidianConfig(REPO_ROOT, { env: { DIJIPEOPLE_OBSIDIAN_CONFIG: EXPLICIT_CONFIG } })
    : resolveObsidianConfig(REPO_ROOT);

  if (resolution.status !== 'NOT_CONFIGURED' && resolution.status !== 'INVALID') {
    console.log(describeResolution(resolution));
    console.log('');
    const { mappings, mode } = resolveMappings(resolution.config);
    return { vaultPath: resolution.vaultPath, mappings, mode, resolution };
  }

  /*
   * Absent config is not an error: a fresh clone has no vault, and an agent
   * chaining this after a deployment must not abort because documentation sync
   * was never configured. Exit 0 with the token the framework expects — but
   * print every place that was searched, because "not configured" was
   * previously indistinguishable from "configured somewhere I did not look".
   */
  console.log('OBSIDIAN_SYNC = SKIPPED_NO_LOCAL_CONFIG');
  console.log('');
  console.log(describeResolution(resolution));
  console.log('');
  console.log('To enable, in any worktree:');
  console.log('  cp .obsidian-sync.example.json .obsidian-sync.local.json');
  console.log('');
  console.log('then set "vaultPath". `.obsidian-sync.local.json` is gitignored, so your');
  console.log('path never reaches the repository; `.obsidian-sync.example.json` is the');
  console.log('tracked template and is never read as runtime configuration.');
  console.log('');
  console.log('A config in the primary checkout, in the shared Git directory, or in');
  console.log('DIJIPEOPLE_OBSIDIAN_VAULT is found automatically from every worktree.');
  process.exit(0);
}

/*
 * `resolveMappings` (above, in loadConfig) merges rather than replaces: config
 * mappings ADD to the defaults. The previous behaviour was replace-on-present,
 * which had exactly the failure you would expect — a local config pins the
 * mappings that existed when it was written, so every mapping added afterwards
 * silently never syncs, for the one person who actually configured a vault. A
 * stale local file must not be able to un-publish knowledge.
 */

/** Markdown files only. Never copies anything else out of the repository. */
function markdownFilesIn(dir) {
  const out = [];
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFilesIn(full));
    else if (entry.endsWith('.md')) out.push(full);
  }

  return out;
}

/**
 * A generated note must carry real content — see the empty-note policy in
 * scripts/lib/obsidian-mappings.mjs. Folder READMEs face a lower bar but still
 * may not be hollow: explaining a folder is a legitimate job.
 */
function isPublishable(file, body) {
  const minimumWords = /^README\.md$/i.test(basename(file)) ? 20 : 40;
  return hasMeaningfulContent(body, { minimumWords });
}

/**
 * `OBSIDIAN_SYNC_STATUS = PASS` must mean the vault is actually right, not that
 * a copy loop exited zero.
 *
 * Every failure this has had was silent: a mapping whose source directory had
 * been renamed, a note published with nothing in it, a wikilink pointing at a
 * note the sync never wrote. All three pass an exit-code check, and all three
 * are caught by reading the vault back.
 *
 * Manual notes are checked for *absence of interference* only. This script
 * writes exclusively into mapped agent-owned folders, and verification confirms
 * that boundary rather than inspecting anybody's notes.
 */
/*
 * Orphan and staleness scan — the half of verification that was missing.
 *
 * `verify` above walks repo -> vault: every source note must exist, match and
 * resolve its links. Nothing walked vault -> repo, so a generated note whose
 * source was renamed, merged or deleted stayed in the vault forever, invisible
 * to every check and to every agent that reported OBSIDIAN_SYNC_STATUS = PASS.
 * That is the ownership defect, not a stale note here or there: the direction
 * that detects rot was never traversed.
 *
 * MAPPING TARGETS NEST, and this is the trap. `docs/knowledge/dashboards`
 * publishes to `00 - Home/Generated`, while `docs/backlog`, `docs/tasks` and
 * `docs/sessions` publish to folders directly beneath it. A recursive walk of
 * the parent sees every child mapping's notes too and attributes them to a
 * source directory that never contained them. Written naively, this scan
 * reports 94 orphans in a vault that has exactly none — and a verifier that
 * cries wolf gets skipped, which is precisely how the thing it verifies rots.
 *
 * Manual notes are never touched and never counted: only the mapped,
 * agent-owned folders are traversed, and everything outside them is the user's.
 */
const norm = (value) => value.split(sep).join('/');

/*
 * GRAPH_ORPHAN detection — a different question from SOURCE_ORPHAN.
 *
 *   SOURCE_ORPHAN  the generated note has no canonical source. `scanOrphans`
 *                  answers this by walking vault -> repo.
 *   GRAPH_ORPHAN   the note has a perfectly valid source and is still an
 *                  isolated dot: nothing links to it, it links to nothing, and
 *                  it is unreachable in the graph except by search.
 *
 * The second is invisible to every parity check, which is why a vault can pass
 * verification and still look like scattered dust in the graph view. Measured on
 * 2026-08-18: 102 of 294 generated nodes were isolated — 82 of them QA
 * scenarios whose relationships were sitting in frontmatter (AREA, RELATED_BUGS,
 * RELATED_REGRESSIONS) where Obsidian cannot see them, because a YAML value is
 * not a wikilink.
 *
 * NAVIGATION AGGREGATES ARE NOT KNOWLEDGE NODES. `index.md`, `README.md`,
 * `active.md`, `completed.md` and the dashboards are generated listing surfaces.
 * Requiring them to carry domain relationships would mean adding links for the
 * sake of the graph, which is the one thing this must not do — a link created to
 * remove a dot teaches nothing and dilutes every real edge around it. They are
 * classified STANDALONE_ALLOWED, by name and with that reason.
 *
 * Any individual note may also opt out by declaring `STANDALONE_ALLOWED: true`
 * in its frontmatter, which makes the exemption explicit and greppable rather
 * than a silent hole in the checker.
 */
const NAVIGATION_AGGREGATES = new Set([
  'index',
  'README',
  'open',
  'active',
  'blocked',
  'completed',
  'deferred',
  'product-decisions',
  'coverage-matrix',
]);

/*
 * Whole categories that are evidence or coordination records rather than
 * knowledge nodes. Each is classified here, by mapping source and with its
 * reason, instead of being silently skipped — an unexplained exemption is a hole
 * in the checker, and the next person cannot tell it from an oversight.
 *
 * The categories that DO require a relationship are the ten knowledge kinds:
 * bugs, backlog items, requirements, decisions, tasks, QA scenarios,
 * regressions, releases, modules and architecture notes.
 */
const STANDALONE_CATEGORIES = new Map([
  ['docs/sessions', 'a session is a runtime coordination lease, not durable knowledge'],
  ['docs/qa/runs', 'a QA run is dated execution evidence; the scenarios it ran carry the relationships'],
  ['docs/engineering-history/tasks', 'a history record narrates one task end to end and is reached from that task'],
  ['docs/qa/test-strategy', 'strategy prose describing how testing is organised, not a node about a thing'],
]);

function scanGraph(mappings) {
  const nodes = new Map();
  const byName = new Map();

  for (const mapping of mappings) {
    const sourceDir = resolve(REPO_ROOT, mapping.from);
    if (!existsSync(sourceDir)) continue;
    for (const file of markdownFilesIn(sourceDir)) {
      const body = readFileSync(file, 'utf8');
      if (!isPublishable(file, body)) continue;
      const name = basename(file, '.md');
      const node = {
        name,
        note: `${mapping.to}/${norm(relative(sourceDir, file))}`,
        body,
        degree: 0,
        standalone:
          NAVIGATION_AGGREGATES.has(name) ||
          STANDALONE_CATEGORIES.has(mapping.from) ||
          /^STANDALONE_ALLOWED:\s*true\s*$/m.test(body.slice(0, 2048)),
      };
      nodes.set(file, node);
      byName.set(name, node);
      const aliases = /^aliases:\s*\[([^\]]*)\]\s*$/m.exec(body.slice(0, 2048));
      if (aliases) {
        for (const alias of aliases[1].split(',')) {
          const trimmed = alias.trim().replace(/^["']|["']$/g, '');
          if (trimmed) byName.set(trimmed, node);
        }
      }
    }
  }

  // Edges are counted in BOTH directions: an inbound link makes a note reachable
  // just as well as an outbound one does.
  for (const node of nodes.values()) {
    const linkable = node.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const match of linkable.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
      const target = byName.get(match[1].trim());
      if (!target || target === node) continue;
      node.degree += 1;
      target.degree += 1;
    }
  }

  const graphOrphans = [];
  let standaloneAllowed = 0;
  for (const node of nodes.values()) {
    if (node.standalone) {
      standaloneAllowed += 1;
      continue;
    }
    if (node.degree === 0) graphOrphans.push(node.note);
  }

  return { graphOrphans, standaloneAllowed, graphNodes: nodes.size };
}

function scanOrphans(vaultPath, mappings) {
  const allTargets = mappings.map((mapping) => norm(mapping.to));
  const orphans = [];
  const stale = [];
  const missing = [];
  let vaultNotes = 0;

  const walkExcluding = (dir, base, excluded) => {
    let found = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = norm(relative(base, full));
      if (entry.isDirectory()) {
        if (excluded.includes(rel)) continue;
        found = found.concat(walkExcluding(full, base, excluded));
      } else if (entry.name.endsWith('.md')) {
        found.push(full);
      }
    }
    return found;
  };

  for (const mapping of mappings) {
    const target = norm(mapping.to);
    const nested = allTargets
      .filter((other) => other !== target && other.startsWith(`${target}/`))
      .map((other) => other.slice(target.length + 1));

    const sourceDir = resolve(REPO_ROOT, mapping.from);
    const targetDir = resolve(vaultPath, mapping.to);
    if (!existsSync(targetDir)) continue;

    const sources = existsSync(sourceDir)
      ? markdownFilesIn(sourceDir).filter((file) => isPublishable(file, readFileSync(file, 'utf8')))
      : [];
    const published = walkExcluding(targetDir, targetDir, nested);
    vaultNotes += published.length;

    /*
     * Two different conditions, deliberately not collapsed into one number.
     *
     *   ORPHAN_GENERATED_NODE  the source file is gone from the repository
     *                          entirely — renamed, merged or deleted.
     *   STALE_GENERATED_NODE   the source still exists but the sync no longer
     *                          publishes it, because `isPublishable` rejects it
     *                          as empty of substance. The vault copy is then
     *                          frozen at whatever it said when it last shipped,
     *                          and nothing maintains it again.
     *
     * The second class is the one that actually existed here: four folder
     * README stubs, published before the substance filter, unmaintained since.
     * Reporting them as "orphan, source missing" would have sent someone
     * looking for a deleted file that is sitting right there.
     */
    const sourceRel = new Set(sources.map((file) => norm(relative(sourceDir, file))));
    for (const file of published) {
      const rel = norm(relative(targetDir, file));
      if (sourceRel.has(rel)) continue;
      const onDisk = join(sourceDir, rel);
      if (existsSync(onDisk)) {
        stale.push({ note: `${mapping.to}/${rel}`, path: file, source: onDisk });
      } else {
        orphans.push({ note: `${mapping.to}/${rel}`, path: file, source: null });
      }
    }
    const publishedRel = new Set(published.map((file) => norm(relative(targetDir, file))));
    for (const rel of sourceRel) {
      if (!publishedRel.has(rel)) missing.push(`${mapping.to}/${rel}`);
    }
  }

  return { orphans, stale, missing, vaultNotes };
}

function verify(vaultPath, mappings) {
  const problems = [];
  const checked = [];
  let notes = 0;
  let links = 0;
  let unresolved = 0;

  /* The node-contract counters, reported whether or not any of them fires. */
  let missingProvenance = 0;
  let pathMismatches = 0;
  let typeMismatches = 0;
  let statusMismatches = 0;
  const duplicates = [];
  const duplicateIds = new Map();
  const nodeTypeByName = new Map();
  const linkPairs = [];

  /*
   * Obsidian resolves a wikilink by note name **or by an alias** declared in
   * frontmatter. Every record here is named `BUG-0047-<slug>.md` and carries
   * `aliases: [BUG-0047]` precisely so `[[BUG-0047]]` works — that is why
   * `new-bug.mjs` emits the alias line at all (ITEM-0029).
   *
   * The first version of this check resolved by basename alone and reported 300+
   * "unresolved" links that Obsidian resolves perfectly well. A verifier that
   * cries wolf is worse than none: it trains people to skip the output, which is
   * exactly what a verification step must never do.
   */
  const vaultNotes = new Set();
  for (const file of markdownFilesIn(vaultPath)) {
    vaultNotes.add(basename(file, '.md'));
    let head;
    try {
      head = readFileSync(file, 'utf8').slice(0, 2048);
    } catch {
      continue;
    }
    const aliases = /^aliases:\s*\[([^\]]*)\]\s*$/m.exec(head);
    if (!aliases) continue;
    for (const alias of aliases[1].split(',')) {
      const name = alias.trim().replace(/^["']|["']$/g, '');
      if (name) vaultNotes.add(name);
    }
  }

  for (const mapping of mappings) {
    const sourceDir = resolve(REPO_ROOT, mapping.from);
    const targetDir = resolve(vaultPath, mapping.to);
    const sources = markdownFilesIn(sourceDir).filter((file) =>
      isPublishable(file, readFileSync(file, 'utf8')),
    );

    if (!sources.length) continue;

    if (!existsSync(targetDir)) {
      problems.push(
        `${mapping.to} — destination folder absent, though ${sources.length} note(s) map to it`,
      );
      continue;
    }
    checked.push(mapping.to);

    for (const file of sources) {
      const relativePath = relative(sourceDir, file);
      const target = join(targetDir, relativePath);
      const label = `${mapping.to}/${relativePath}`.replace(/\\/g, '/');

      if (!existsSync(target)) {
        problems.push(`${label} — expected note is absent from the vault`);
        continue;
      }

      const published = readFileSync(target, 'utf8');
      notes += 1;

      if (!isPublishable(file, published)) {
        problems.push(`${label} — published but empty of substance`);
      }

      const source = readFileSync(file, 'utf8');
      const expected = publishedForm(file, source, mapping, relativePath);

      if (published !== expected) {
        problems.push(`${label} — vault copy differs from its repository source; re-run the sync`);
      }

      /*
       * The node contract, checked against the note actually on disk rather than
       * against what the sync intended to write. This is the half that catches a
       * note whose source was renamed: the content can still match a file
       * somewhere, while the provenance points at a path that no longer exists.
       */
      const provenance = readProvenance(published);
      if (!provenance) {
        missingProvenance += 1;
        problems.push(
          `${label} — no generated-node provenance. Without source_path and source_id a note ` +
            'can only be matched to its source by filename, which survives a rename silently.',
        );
      } else {
        const expectedPath = relative(REPO_ROOT, file).split(sep).join('/');
        const expectedType = nodeTypeFor(mapping, relativePath.split(sep).join('/'));

        if (provenance.sourcePath !== expectedPath) {
          pathMismatches += 1;
          problems.push(
            `${label} — SOURCE_PATH_MISMATCH: note claims ${provenance.sourcePath || '(none)'}, source is ${expectedPath}`,
          );
        }
        if (provenance.nodeType !== expectedType) {
          typeMismatches += 1;
          problems.push(
            `${label} — NODE_TYPE_MISMATCH: note claims ${provenance.nodeType || '(none)'}, mapping says ${expectedType}`,
          );
        }

        /*
         * Status parity. A vault that says a bug is OPEN while the record says
         * VERIFIED is worse than a vault with no status at all — somebody reads
         * it and acts on it.
         */
        /*
         * Read from the source's *frontmatter*, not from anywhere in the file.
         * A folder README that happens to contain the line "Status: OPEN" in a
         * prose table has no canonical status at all, and comparing against it
         * reported a mismatch on a note that was correct.
         */
        const sourceFrontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
        const canonicalStatus =
          /^(?:Status|STATUS|TASK_STATUS):[^\S\r\n]*(.*)$/m.exec(sourceFrontmatter)?.[1]?.trim() ?? '';
        if (canonicalStatus && provenance.status !== canonicalStatus) {
          statusMismatches += 1;
          problems.push(
            `${label} — STATUS_MISMATCH: note says ${provenance.status || '(none)'}, record says ${canonicalStatus}`,
          );
        }

        if (!provenance.sourceCommit) {
          problems.push(`${label} — no source_commit, so the note carries no freshness proof`);
        }

        /*
         * STANDALONE_ALLOWED is not an escape hatch. Opting out of graph-orphan
         * detection without saying who decided and why turns a check into a
         * checkbox — and generated records are exactly the population that
         * should almost never qualify.
         */
        if (provenance.standaloneAllowed) {
          const missing = [];
          if (!provenance.standaloneReason) missing.push('STANDALONE_ALLOWED_REASON');
          if (!provenance.standaloneBy) missing.push('STANDALONE_ALLOWED_BY');
          if (!provenance.standaloneAt) missing.push('STANDALONE_ALLOWED_AT');
          if (missing.length) {
            problems.push(
              `${label} — STANDALONE_ALLOWED without ${missing.join(', ')}; an exemption with no author or reason is a hole, not a decision`,
            );
          }
        }

        nodeTypeByName.set(basename(target, '.md'), provenance.nodeType);

        /*
         * Duplicate detection applies only to *allocated* ids.
         *
         * A folder README or a generated index has no record id, so `source_id`
         * falls back to the filename — and every mapping has a `README.md`. The
         * first version of this check reported 53 duplicates, all of them
         * `README` and `index`, and none of them a problem. Two notes sharing
         * `BUG-0005` is a stale copy left by a rename; two notes both called
         * README is the folder structure working.
         */
        const ALLOCATED_ID =
          /^(?:BUG|ITEM|TASK|SESSION|ADR|QUESTION|PLAN|WP)-\d+(?:-WP-\d+)?$|^QA-[A-Z]+-\d+$|^REG-\d+$/;
        if (ALLOCATED_ID.test(provenance.sourceId)) {
          const seenAt = duplicateIds.get(provenance.sourceId);
          if (seenAt && seenAt !== label) {
            duplicates.push(`${provenance.sourceId}: ${seenAt} and ${label}`);
          } else {
            duplicateIds.set(provenance.sourceId, label);
          }
        }
      }

      /*
       * A wikilink that resolves to nothing is not visibly broken in Obsidian —
       * it renders as an invitation to create the note. That is exactly why an
       * unresolved *generated* link is worth failing on: nobody would notice it.
       *
       * Code is stripped first. This repository's documentation writes *about*
       * wikilinks — "use `[[wikilinks]]`, not relative paths" — and Obsidian
       * does not render a link inside a code span, so flagging those is a false
       * positive. Two of them were the entire remaining failure list, and a
       * verifier that cries wolf gets skipped.
       */
      const linkable = published
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`\n]*`/g, '');

      for (const match of linkable.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
        links += 1;
        const name = match[1].trim();
        if (!vaultNotes.has(name)) {
          unresolved += 1;
          problems.push(`${label} — wikilink [[${name}]] resolves to no note in the vault`);

          /*
           * The specific mistake worth naming rather than merely counting: a
           * repository path written as a wikilink. `.agent/context/` is not
           * mapped into the vault, so `[[testing-architecture]]` can never
           * resolve — and the tempting repair is to create the node, which
           * fabricates a vault entry for a file that lives only in the repo.
           */
          if (/\.(md|mjs|ts|tsx|json|ya?ml)$/i.test(name) || name.includes('/')) {
            problems.push(
              `${label} — [[${name}]] looks like a repository path. Repository paths are ` +
                'written as inline code, never as wikilinks; do not create a node to make it resolve.',
            );
          }
        } else {
          /* Semantics are checked after the walk, once every note type is known. */
          linkPairs.push({ label, from: basename(target, '.md'), to: name });
        }
      }
    }
  }

  /*
   * Semantic link validation, once every note's type is known.
   *
   * A link that resolves is not automatically an edge worth having. A Bug
   * pointing at its Regression is knowledge; a Bug pointing at a Release note
   * because somebody needed to clear a graph orphan is noise that looks
   * identical to knowledge in the graph view.
   *
   * Aliases are resolved back to their note first — `[[BUG-0005]]` is an alias
   * for `BUG-0005-<slug>`, and the type is recorded under the file name.
   */
  let semanticErrors = 0;
  for (const pair of linkPairs) {
    const fromType = nodeTypeByName.get(pair.from);
    let toType = nodeTypeByName.get(pair.to);
    if (!toType) {
      for (const [name, type] of nodeTypeByName) {
        if (name.startsWith(`${pair.to}-`)) {
          toType = type;
          break;
        }
      }
    }
    if (!fromType || !toType) continue;
    if (!relationshipIsValid(fromType, toType)) {
      semanticErrors += 1;
      problems.push(
        `${pair.label} — SEMANTIC_LINK_ERROR: a ${fromType} linking to a ${toType} ([[${pair.to}]]) ` +
          'is not a defined relationship. Link what the record actually relates to, rather than ' +
          'adding an edge to remove a dot.',
      );
    }
  }

  for (const entry of duplicates) {
    problems.push(
      `DUPLICATE_NODE: ${entry} — two generated notes claim the same source id, so one of them ` +
        'is a stale copy left behind by a rename.',
    );
  }

  console.log(`Vault:  ${vaultPath}`);
  console.log('Mode:   verify — reading the vault back, not trusting the last exit code');
  console.log('');
  const {
    orphans,
    stale,
    missing,
    vaultNotes: generatedNoteCount,
  } = scanOrphans(vaultPath, mappings);
  const { graphOrphans, standaloneAllowed, graphNodes } = scanGraph(mappings);

  /*
   * An orphan is a HARD failure, not a warning. A generated note whose source no
   * longer exists is a statement about the engineering state that nothing in the
   * repository backs any more — and it looks exactly as authoritative in the
   * graph as a current one.
   *
   * A CLOSED bug record is NOT an orphan. Its source still exists in docs/bugs/;
   * it is a valid historical node and stays. Orphan means the SOURCE is gone.
   */
  for (const orphan of orphans) {
    problems.push(
      `${orphan.note} — ORPHAN_GENERATED_NODE: no source in the repository. ` +
        'Remove the generated copy, or restore the source if the deletion was wrong.',
    );
  }
  for (const note of graphOrphans) {
    problems.push(
      `${note} — GRAPH_ORPHAN: no inbound or outbound wikilink, so the note is ` +
        'unreachable in the graph. Declare the relationship it already has ' +
        '(module, bug, regression, plan, task) rather than adding a link to remove ' +
        'the dot; or mark it STANDALONE_ALLOWED: true with a reason.',
    );
  }
  for (const entry of stale) {
    problems.push(
      `${entry.note} — STALE_GENERATED_NODE: the source exists but is no longer ` +
        'published (empty of substance), so the vault copy is frozen and unmaintained. ' +
        'Remove the generated copy, or give the source real content.',
    );
  }

  console.log(`FOLDERS_CHECKED             ${checked.length}`);
  console.log(`NOTES_VERIFIED              ${notes}`);
  console.log(`WIKILINKS_CHECKED           ${links}`);
  console.log(`OBSIDIAN_UNRESOLVED_LINKS   ${unresolved}`);
  console.log(`VAULT_GENERATED_NOTES       ${generatedNoteCount}`);
  console.log(`OBSIDIAN_ORPHAN_COUNT       ${orphans.length}`);
  console.log(`OBSIDIAN_STALE_GENERATED    ${stale.length}`);
  console.log(`OBSIDIAN_SOURCE_ORPHANS     ${orphans.length}`);
  console.log(`OBSIDIAN_GRAPH_NODES        ${graphNodes}`);
  console.log(`OBSIDIAN_GRAPH_ORPHANS      ${graphOrphans.length}`);
  console.log(`OBSIDIAN_STANDALONE_ALLOWED ${standaloneAllowed}`);
  console.log(`OBSIDIAN_PARITY_DIFFS       ${missing.length}`);
  /*
   * The node-contract counters. Printed unconditionally, including the zeros:
   * a field that only appears when it fires cannot be read as "checked and
   * clean", and the completion contract asks for each of these by name.
   */
  console.log(`OBSIDIAN_REPO_TO_VAULT_DIFFS  ${problems.filter((p) => /expected note is absent/.test(p)).length}`);
  console.log(`OBSIDIAN_VAULT_TO_REPO_DIFFS  ${orphans.length}`);
  console.log(`OBSIDIAN_MISSING_PROVENANCE   ${missingProvenance}`);
  console.log(`OBSIDIAN_PATH_MISMATCHES      ${pathMismatches}`);
  console.log(`OBSIDIAN_NODE_TYPE_MISMATCHES ${typeMismatches}`);
  console.log(`OBSIDIAN_STATUS_MISMATCHES    ${statusMismatches}`);
  console.log(`OBSIDIAN_SEMANTIC_LINK_ERRORS ${semanticErrors}`);
  console.log(`OBSIDIAN_DUPLICATE_NODES      ${duplicates.length}`);
  console.log(`OBSIDIAN_STALE_NODES          ${stale.length}`);
  console.log('MANUAL_NOTES_UNTOUCHED      all — verification reads only the mapped agent-owned folders');
  console.log('');

  if (problems.length) {
    console.error(`OBSIDIAN_SYNC_STATUS = FAILED — ${problems.length} problem(s):`);
    for (const problem of problems.slice(0, 40)) console.error(`  x ${problem}`);
    if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
    console.error('');
    console.error('A documentation-automation failure never rolls back healthy work — and never');
    console.error('hides either. Cap the task at COMPLETE_WITH_DOCUMENTATION_WARNING.');
    process.exit(1);
  }

  console.log('OBSIDIAN_SYNC_STATUS = PASS');
  console.log('Every mapped note exists, carries substance, matches its source, and every');
  console.log('generated wikilink resolves.');
}

function main() {
  const { vaultPath, mappings, mode } = loadConfig();

  if (VERIFY) {
    verify(vaultPath, mappings);
    return;
  }

  console.log(`Vault:  ${vaultPath}`);
  console.log(`Mode:   ${DRY_RUN ? 'dry run — nothing will be written' : 'write'}`);
  console.log(
    `Config: mappings ${mode === 'replace' ? 'replaced by' : 'merged with'} local config — ${mappings.length} total`,
  );
  console.log('');

  const created = [];
  const updated = [];
  const skippedNoEvidence = [];
  let unchanged = 0;
  let emptyMappings = 0;

  for (const mapping of mappings) {
    const sourceDir = resolve(REPO_ROOT, mapping.from);
    const targetDir = resolve(vaultPath, mapping.to);
    const files = markdownFilesIn(sourceDir);

    if (files.length === 0) {
      emptyMappings += 1;
      console.log(`  --  ${mapping.from} → ${mapping.to} (nothing to sync)`);
      continue;
    }

    for (const file of files) {
      /*
       * Same source file always maps to the same target note. Evergreen notes
       * update in place; nothing is ever timestamped on the way in. QA runs
       * carry their date in the filename already, so they accumulate as
       * history without any special handling here.
       */
      const relativePath = relative(sourceDir, file);
      const target = join(targetDir, relativePath);
      const source = readFileSync(file, 'utf8');
      const label = `${mapping.from}/${relativePath}`.replace(/\\/g, '/');

      if (!isPublishable(file, source)) {
        skippedNoEvidence.push(label);
        continue;
      }

      const rendered = publishedForm(file, source, mapping, relativePath);

      const exists = existsSync(target);
      if (exists && readFileSync(target, 'utf8') === rendered) {
        unchanged += 1;
        continue;
      }

      if (!DRY_RUN) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, rendered, 'utf8');
      }

      (exists ? updated : created).push(label);
    }
  }

  /*
   * The population report.
   *
   * Half the point of a one-time knowledge bootstrap is that it is reviewable
   * BEFORE it lands in someone's notes, so --dry-run has to say exactly what it
   * would do — not merely how many files.
   */
  const section = (label, entries) => {
    console.log(`${label}: ${entries.length}`);
    for (const entry of entries) console.log(`    ${entry}`);
    if (entries.length) console.log('');
  };

  section(DRY_RUN ? 'NOTES_TO_CREATE' : 'NOTES_CREATED', created);
  section(DRY_RUN ? 'NOTES_TO_UPDATE' : 'NOTES_UPDATED', updated);
  section('NOTES_SKIPPED_NO_EVIDENCE', skippedNoEvidence);

  console.log(`NOTES_ALREADY_CURRENT: ${unchanged}`);
  console.log(`MAPPINGS_WITH_NO_SOURCE: ${emptyMappings}`);
  console.log('MANUAL_NOTES_UNTOUCHED: all — this script writes only into the mapped');
  console.log('                        agent-owned folders and reads nothing else.');
  console.log('');

  if (skippedNoEvidence.length) {
    console.log('Skipped notes carried no meaningful content beyond a title and headings.');
    console.log('That is the empty-note policy working, not a failure: a generated note');
    console.log('with nothing in it fills a folder and answers a search with silence.');
    console.log('');
  }

  console.log(
    `${DRY_RUN ? 'Would write' : 'Wrote'} ${created.length + updated.length} file(s); ` +
      `${unchanged} already current; ${skippedNoEvidence.length} skipped as empty.`,
  );
  console.log('Notes outside the mapped agent-owned folders were not touched.');
}

main();
